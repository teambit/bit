//! Read-only import capture. Every mutable remote and local input is revalidated
//! before the owner publishes any part of the prepared refresh.
use super::invalid;
use crate::checkout::repository;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

/// The bytes one import holds in memory: retained objects, and separately
/// their inflated bodies. A pattern import of a whole scope reaches hundreds of MiB.
pub(super) const MAX_BYTES: usize = 1024 * 1024 * 1024;
const MAX_RECORDS: usize = 131_072;

#[derive(Clone)]
pub(super) struct Object {
    pub(super) kind: String,
    pub(super) bytes: Vec<u8>,
    pub(super) value: Option<Value>,
    pub(super) source: Option<Vec<u8>>,
    pub(super) inflated_size: usize,
}
#[derive(Default)]
pub(super) struct Capture {
    proofs: HashMap<PathBuf, Option<[u8; 32]>>,
    virtual_files: HashMap<PathBuf, Vec<u8>>,
    virtual_bytes: usize,
    bytes: usize,
    raw_bytes: usize,
}
impl Capture {
    pub(super) fn accept_known(&mut self, path: &Path, bytes: &[u8]) {
        if let Some(proof) = self.proofs.get_mut(path) {
            *proof = Some(Sha256::digest(bytes).into());
            self.virtual_files.remove(path);
        }
    }

    pub(super) fn virtual_file(&mut self, path: PathBuf, bytes: Vec<u8>) -> io::Result<()> {
        if self.virtual_files.len() >= MAX_RECORDS
            || bytes.len() > MAX_BYTES.saturating_sub(self.virtual_bytes)
        {
            return Err(invalid("virtual import byte or object limit"));
        }
        self.virtual_bytes += bytes.len();
        if self.virtual_files.insert(path, bytes).is_some() {
            return Err(invalid("duplicate virtual import object"));
        }
        Ok(())
    }
    pub(super) fn accept_restored(
        &mut self,
        path: &Path,
        expected: Option<&[u8]>,
    ) -> io::Result<()> {
        let actual = read(path, MAX_BYTES)?;
        if actual.as_deref() != expected || !self.proofs.contains_key(path) {
            return Err(invalid("import restored control changed"));
        }
        self.proofs.insert(path.to_owned(), expected.map(|bytes| Sha256::digest(bytes).into()));
        Ok(())
    }
    pub(super) fn read(&mut self, path: &Path) -> io::Result<Option<Vec<u8>>> {
        if self.proofs.len() >= MAX_RECORDS {
            return Err(invalid("import proof limit"));
        }
        let known_virtual = self.virtual_files.contains_key(path) && self.proofs.contains_key(path);
        let bytes = match self.virtual_files.get(path) {
            Some(bytes) if known_virtual || bytes.len() <= MAX_BYTES.saturating_sub(self.bytes) => {
                Some(bytes.clone())
            }
            Some(_) => return Err(invalid("virtual import read budget")),
            None => read(path, MAX_BYTES.saturating_sub(self.bytes))?,
        };
        if !known_virtual {
            self.bytes += bytes.as_ref().map_or(0, Vec::len);
        }
        let hash = bytes
            .as_ref()
            .map(|bytes| Sha256::digest(bytes).into());
        if let Some(previous) = self.proofs.insert(path.to_owned(), hash)
            && previous != hash
        {
            return Err(invalid("import input changed during capture"));
        }
        Ok(bytes)
    }
    pub(super) fn json(&mut self, path: &Path) -> io::Result<Option<Value>> {
        self.read(path)?
            .map(|bytes| serde_json::from_slice(&bytes).map_err(io::Error::other))
            .transpose()
    }
    pub(super) fn object(
        &mut self,
        directory: &Path,
        hash: &str,
        kind: &str,
    ) -> io::Result<Option<Object>> {
        let identity = crate::merge_history::hash(hash)?;
        let path = directory
            .join(&hash[..2])
            .join(&hash[2..]);
        let Some(bytes) = self.read(&path)? else { return Ok(None) };
        let raw = if self.virtual_files.contains_key(&path) {
            repository::inflate(&bytes, 32 * 1024 * 1024)?
        } else {
            let mut total = 0;
            repository::read(directory, identity, 32 * 1024 * 1024, &mut total)?
        };
        // The repository reader opens the object independently; prove it still
        // corresponds to the bytes retained for later publication.
        if !self.virtual_files.contains_key(&path)
            && read(&path, MAX_BYTES)?.as_ref() != Some(&bytes)
        {
            return Err(invalid("import object changed during capture"));
        }
        self.raw_bytes += raw.len();
        if self.raw_bytes > MAX_BYTES {
            return Err(invalid("import inflated byte limit"));
        }
        let (_, body) = repository::split(&raw, identity, kind)?;
        let value = if kind == "Source" {
            use sha1::Sha1;
            if crate::validate::hexadecimal(&Sha1::digest(body)) != hash {
                return Err(invalid("import Source identity"));
            }
            None
        } else {
            Some(serde_json::from_slice(body).map_err(io::Error::other)?)
        };
        Ok(Some(Object {
            kind: kind.to_owned(),
            bytes,
            value,
            source: (kind == "Source").then(|| body.to_vec()),
            inflated_size: raw.len(),
        }))
    }
    pub(super) fn sources(
        &mut self,
        directory: &Path,
        hashes: &[String],
    ) -> io::Result<Vec<(String, Object)>> {
        if hashes
            .iter()
            .any(|hash| {
                let path = directory
                    .join(&hash[..2])
                    .join(&hash[2..]);
                self.virtual_files.contains_key(&path)
            })
        {
            return hashes
                .iter()
                .map(|hash| self.virtual_source(directory, hash))
                .collect();
        }
        use rayon::prelude::*;
        let raw = crate::read_budget::Budget::new(MAX_BYTES.saturating_sub(self.raw_bytes));
        let packed = crate::read_budget::Budget::new(MAX_BYTES.saturating_sub(self.bytes));
        if hashes.len() + self.proofs.len() > MAX_RECORDS {
            return Err(invalid("import source count limit"));
        }
        let records = hashes
            .par_iter()
            .map(|hash| {
                let identity = crate::merge_history::hash(hash)?;
                let record = repository::read_source_shared(directory, identity, &raw, &packed)?;
                Ok((hash.clone(), record))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let mut result = Vec::with_capacity(records.len());
        for (hash, record) in records {
            result.push(self.retain_source(directory, hash, record)?);
        }
        Ok(result)
    }
    fn virtual_source(&mut self, directory: &Path, hash: &str) -> io::Result<(String, Object)> {
        self.object(directory, hash, "Source")?
            .map(|record| (hash.to_owned(), record))
            .ok_or_else(|| invalid("import virtual Source missing"))
    }
    fn retain_source(
        &mut self,
        directory: &Path,
        hash: String,
        record: repository::SourceRecord,
    ) -> io::Result<(String, Object)> {
        self.raw_bytes += record.inflated_size;
        self.bytes += record.compressed.len();
        let path = directory
            .join(&hash[..2])
            .join(&hash[2..]);
        let digest = Some(<[u8; 32]>::from(Sha256::digest(&record.compressed)));
        if self.proofs
            .insert(path, digest)
            .is_some_and(|previous| previous != digest)
        {
            return Err(invalid("import Source changed during capture"));
        }
        Ok((
            hash,
            Object {
                kind: "Source".into(),
                bytes: record.compressed,
                value: None,
                source: Some(record.body),
                inflated_size: record.inflated_size,
            },
        ))
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        let mut total: usize = 0;
        for (path, expected) in &self.proofs {
            if self.virtual_files.contains_key(path) {
                continue;
            }
            let bytes = read(path, MAX_BYTES.saturating_sub(total))?;
            total += bytes.as_ref().map_or(0, Vec::len);
            if bytes
                .as_ref()
                .map(|bytes| <[u8; 32]>::from(Sha256::digest(bytes)))
                != *expected
            {
                return Err(invalid("import capture changed"));
            }
        }
        Ok(())
    }
}
fn read(path: &Path, maximum: usize) -> io::Result<Option<Vec<u8>>> {
    if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(invalid("import symbolic-link metadata requires canonical path handling"));
    }
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !file.metadata()?.is_file() {
        return Err(invalid("import nonordinary input"));
    }
    let mut bytes = Vec::new();
    file.take(maximum as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("import capture byte limit"));
    }
    Ok(Some(bytes))
}

#[cfg(test)]
mod tests;

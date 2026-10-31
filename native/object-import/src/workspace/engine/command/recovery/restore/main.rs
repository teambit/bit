//! Restore main's mutable component objects from the upstream `LastMerged` snapshot.
use super::{invalid, proof};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Main {
    directory: PathBuf,
    names: Vec<String>,
    pub(super) objects: Vec<(String, Vec<u8>)>,
}
impl Main {
    pub(super) fn prepare(root: &Path, proofs: &mut Vec<proof::Proof>) -> io::Result<Option<Self>> {
        let directory = crate::scope_path(root).join("last-merged/main-components");
        proof::probe(&directory, proofs)?;
        if !directory.exists() {
            return Ok(None);
        }
        let names = filenames(&directory)?;
        let mut objects = Vec::new();
        let mut total = 0;
        let mut identities = std::collections::HashSet::new();
        for name in &names {
            let bytes = proof::read(&directory.join(name), proofs)?
                .ok_or_else(|| invalid("main recovery backup disappeared"))?;
            let object = decode(&bytes)?;
            total += object.1.len();
            if total > 32 * 1024 * 1024 || !identities.insert(object.0.clone()) {
                return Err(invalid("main recovery duplicate identity or byte limit"));
            }
            objects.push(object);
        }
        validate_index(root, &objects, proofs)?;
        Ok(Some(Self { directory, names, objects }))
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        if filenames(&self.directory)? != self.names {
            return Err(invalid("main recovery inventory changed"));
        }
        Ok(())
    }
    pub(super) fn publish(&self, root: &Path) -> io::Result<()> {
        let store = crate::store::Store::new(crate::scope_path(root).join("objects"), None)?;
        for (hash, bytes) in &self.objects {
            store.write(hash, bytes)?;
        }
        store.finish_batch()
    }
}
fn filenames(directory: &Path) -> io::Result<Vec<String>> {
    if directory.is_symlink() {
        return Err(invalid("main recovery directory symlink"));
    }
    let mut names = fs::read_dir(directory)?
        .map(|entry| {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                return Err(invalid("main recovery non-file backup"));
            }
            entry
                .file_name()
                .into_string()
                .map_err(|_| invalid("main recovery backup filename"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if names.len() > 4096 {
        return Err(invalid("main recovery object limit"));
    }
    names.sort();
    Ok(names)
}
fn decode(bytes: &[u8]) -> io::Result<(String, Vec<u8>)> {
    let raw = crate::checkout::repository::inflate(bytes, 8 * 1024 * 1024)?;
    let nul = raw
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(|| invalid("main recovery object header"))?;
    if !raw[..nul].starts_with(b"Component ") {
        return Err(invalid("main recovery non-component backup"));
    }
    let value: Value = crate::parse_jsonc(&raw[nul + 1..]).map_err(io::Error::other)?;
    super::super::super::lane_publication::encode_model(&value)
}
fn validate_index(
    root: &Path,
    objects: &[(String, Vec<u8>)],
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let bytes = proof::read(&crate::scope_path(root).join("index.json"), proofs)?
        .ok_or_else(|| invalid("main recovery index absent"))?;
    let index: Value = crate::parse_jsonc(&bytes).map_err(io::Error::other)?;
    let entries = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("main recovery index shape"))?;
    if objects
        .iter()
        .any(|(hash, _)| {
            !entries
                .iter()
                .any(|entry| entry["hash"].as_str().map(str::trim) == Some(hash.as_str()))
        })
    {
        return Err(invalid("main recovery index repair requires the published runtime"));
    }
    Ok(())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;

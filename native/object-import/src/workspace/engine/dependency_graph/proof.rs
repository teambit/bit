use super::{Row, invalid};
use crate::workspace::engine::path;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Proof {
    pub(in crate::workspace::engine) path: PathBuf,
    pub(in crate::workspace::engine) hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    exists: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    metadata: Option<Metadata>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    kind: String,
    real_path: Option<PathBuf>,
}
impl Metadata {
    fn capture(file: &Path, metadata: Option<&fs::Metadata>) -> io::Result<Self> {
        let kind = match metadata {
            None => "missing",
            Some(metadata) if metadata.is_file() => "file",
            Some(metadata) if metadata.is_dir() => "directory",
            Some(_) => "other",
        };
        let real_path = metadata.map(|_| fs::canonicalize(file)).transpose()?;
        Ok(Self { kind: kind.to_owned(), real_path })
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    read_set: Vec<Proof>,
}
pub(in crate::workspace::engine) fn apply(request: &Request) -> io::Result<(usize, Value)> {
    verify(&request.read_set)?;
    Ok((request.read_set.len(), serde_json::json!({"fresh":true})))
}
pub(in crate::workspace::engine) fn verify(proofs: &[Proof]) -> io::Result<()> {
    if proofs.len() > 16384 {
        return Err(invalid("dependency proof count limit"));
    }
    let bytes = AtomicUsize::new(0);
    proofs
        .par_iter()
        .try_for_each(|proof| {
            let size = verify_one(proof)?;
            if bytes.fetch_add(size, Ordering::Relaxed) + size > 96 * 1024 * 1024 {
                return Err(invalid("dependency proof read limit"));
            }
            Ok(())
        })
}
fn verify_one(proof: &Proof) -> io::Result<usize> {
    path(&proof.path)?;
    if let Some(expected) = &proof.metadata {
        return verify_metadata(proof, expected);
    }
    if let Some(exists) = proof.exists {
        if proof.path.try_exists()? != exists || proof.hash.is_some() {
            return Err(invalid("dependency capture changed"));
        }
        return Ok(0);
    }
    let content = contents(&proof.path)?;
    if content.as_ref().map(|data| hash(data)) != proof.hash {
        return Err(invalid("dependency capture changed"));
    }
    Ok(content.as_ref().map_or(0, Vec::len))
}
fn verify_metadata(proof: &Proof, expected: &Metadata) -> io::Result<usize> {
    let metadata = match fs::metadata(&proof.path) {
        Ok(metadata) => Some(metadata),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            None
        }
        Err(error) => return Err(error),
    };
    if proof.hash.is_some()
        || proof.exists.is_some()
        || Metadata::capture(&proof.path, metadata.as_ref())? != *expected
    {
        return Err(invalid("dependency resolution capture changed"));
    }
    Ok(0)
}
pub(in crate::workspace::engine) fn metadata(
    file: &Path,
    value: Option<&fs::Metadata>,
) -> io::Result<Proof> {
    Ok(Proof {
        path: file.to_path_buf(),
        hash: None,
        exists: None,
        metadata: Some(Metadata::capture(file, value)?),
    })
}
pub(in crate::workspace::engine) fn content(file: &Path, bytes: &[u8]) -> Proof {
    Proof { path: file.to_path_buf(), hash: Some(hash(bytes)), exists: None, metadata: None }
}
pub(in crate::workspace::engine) fn read(
    file: &Path,
    proofs: &mut Vec<Proof>,
) -> io::Result<Option<Vec<u8>>> {
    path(file)?;
    if proofs.len() >= 16384 {
        return Err(invalid("dependency proof count limit"));
    }
    let content = contents(file)?;
    proofs.push(Proof {
        path: file.to_path_buf(),
        hash: content.as_ref().map(|data| hash(data)),
        exists: None,
        metadata: None,
    });
    Ok(content)
}
fn contents(file: &Path) -> io::Result<Option<Vec<u8>>> {
    let source = match fs::File::open(file) {
        Ok(source) => source,
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    source
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        return Err(invalid("dependency proof file limit"));
    }
    Ok(Some(bytes))
}
pub(super) fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(super) fn rows(rows: &HashMap<String, Row>, mut proofs: Vec<Proof>) -> io::Result<Value> {
    proofs.extend(
        rows.values()
            .map(|row| Proof {
                path: PathBuf::from(&row.path_map.file),
                hash: Some(row.source_hash.clone()),
                exists: None,
                metadata: None,
            }),
    );
    proofs.sort_by(|left, right| left.path.cmp(&right.path));
    serde_json::to_value(proofs).map_err(io::Error::other)
}

pub(in crate::workspace::engine) fn probe(
    file: &Path,
    proofs: &mut Vec<Proof>,
) -> io::Result<bool> {
    path(file)?;
    let exists = file.try_exists()?;
    if proofs.len() >= 16384 {
        return Err(invalid("dependency proof count limit"));
    }
    proofs.push(Proof {
        path: file.to_path_buf(),
        hash: None,
        exists: Some(exists),
        metadata: None,
    });
    Ok(exists)
}

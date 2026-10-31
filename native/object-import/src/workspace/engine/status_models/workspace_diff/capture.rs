use super::{Request, comparison, invalid};
use crate::workspace::engine::read;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) struct File {
    pub(super) metadata: Value,
    pub(super) contents: Vec<u8>,
    pub(super) cost: usize,
}

pub(super) fn all(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Vec<Vec<File>>> {
    super::super::super::count(request.targets.len())?;
    let mut paths = Vec::new();
    let mut bitmaps = HashSet::new();
    let mut identities = HashSet::new();
    for target in &request.targets {
        comparison::capture::validate(target)?;
        if target.identity.trim().is_empty() || !identities.insert(target.identity.trim()) {
            return Err(invalid("workspace diff duplicate component"));
        }
        for file in &target.files {
            let source = comparison::capture::source_path(&request.root, target, file)?;
            if target.directory == "." && file == ".bitmap" {
                bitmaps.insert(source.clone());
            }
            paths.push(source);
        }
    }
    let captured =
        read::read_with(&paths, pool, |path, bytes| one(path, bytes, bitmaps.contains(path)))?
            .into_iter()
            .collect::<io::Result<Vec<_>>>()?;
    let mut captured = captured.into_iter();
    Ok(request.targets
        .iter()
        .map(|target| {
            target.files
                .iter()
                .filter_map(|file| {
                    let mut captured = captured.next()?;
                    captured.metadata["relativePath"] = json!(file);
                    captured.metadata["name"] = json!(file.rsplit('/').next().unwrap_or(file));
                    Some(captured)
                })
                .collect()
        })
        .collect())
}

fn one(path: &Path, bytes: Vec<u8>, bitmap: bool) -> io::Result<File> {
    let (metadata, contents) = read::canonical(path, bytes);
    if bitmap {
        let normalized = crate::inspection::normalize_bitmap(&contents)?;
        let cost = metadata.raw_bytes.max(normalized.len());
        let (metadata, contents) = read::canonical(path, normalized);
        return Ok(File {
            metadata: json!({"test":false,"file":metadata.linux_hash}),
            contents,
            cost,
        });
    }
    Ok(File {
        metadata: json!({"test":false,"file":metadata.linux_hash}),
        contents,
        cost: metadata.raw_bytes,
    })
}

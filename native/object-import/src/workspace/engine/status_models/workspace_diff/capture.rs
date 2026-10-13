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
    let mut paths = Vec::new();
    let mut identities = HashSet::new();
    for target in &request.targets {
        comparison::capture::validate(target)?;
        if !identities.insert(&target.identity) {
            return Err(invalid("workspace diff duplicate component"));
        }
        paths.extend(
            target.files
                .iter()
                .map(|file| request.root.join(&target.directory).join(file)),
        );
    }
    let bitmap = request.root.join(".bitmap");
    let captured = read::read_with(&paths, pool, |path, bytes| one(path, bytes, &bitmap))?
        .into_iter()
        .collect::<io::Result<Vec<_>>>()?;
    let mut captured = captured.into_iter();
    Ok(request.targets
        .iter()
        .map(|target| {
            target.files
                .iter()
                .map(|file| {
                    let mut captured = captured.next().expect("one source per path");
                    captured.metadata["relativePath"] = json!(file);
                    captured.metadata["name"] = json!(file.rsplit('/').next());
                    captured
                })
                .collect()
        })
        .collect())
}

fn one(path: &Path, bytes: Vec<u8>, bitmap: &Path) -> io::Result<File> {
    let (metadata, contents) = read::canonical(path, bytes);
    if path == bitmap {
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

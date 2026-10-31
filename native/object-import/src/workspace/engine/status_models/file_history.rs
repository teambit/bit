//! Validated per-file Version and Source history shared by `log-file` and `blame`.

#[cfg(test)]
mod tests;

use super::{component_log, invalid};
use crate::{
    checkout::repository, merge_history, merge_transaction, read_budget::Budget, read_version,
};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io,
    path::{Component, Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    identity: String,
    file: String,
    #[serde(default)]
    lane: Option<Value>,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    validate_file(&request.file)?;
    let log_request = serde_json::from_value(json!({
        "root":request.root,"identity":request.identity,"lane":request.lane,
    }))
    .map_err(io::Error::other)?;
    let (_, log) = component_log::read(&log_request, pool)?;
    let logs = log["versions"].as_array().ok_or_else(|| invalid("file history log"))?;
    let rows = rows(&request.root, &request.file, logs)?;
    Ok((rows.len(), json!({"history":rows})))
}

struct Cache {
    versions: HashMap<String, Value>,
    sources: HashMap<String, String>,
    raw: Budget,
    packed: Budget,
}

fn rows(root: &Path, file: &str, logs: &[Value]) -> io::Result<Vec<Value>> {
    let directory = crate::scope_path(root).join("objects");
    let mut reader = read_version::Reader::query(&directory)?;
    let mut cache = Cache {
        versions: HashMap::new(),
        sources: HashMap::new(),
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    logs.iter()
        .map(|log| row(&directory, file, log, &mut reader, &mut cache))
        .collect()
}

fn row(
    directory: &Path,
    file: &str,
    log: &Value,
    reader: &mut read_version::Reader<'_>,
    cache: &mut Cache,
) -> io::Result<Value> {
    let hash = log["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("file history hash"))?;
    let current_version = version(reader, &mut cache.versions, hash)?;
    let current_hash = file_hash(&current_version, file)?;
    let contents = current_hash
        .as_deref()
        .map(|hash| source(directory, &mut cache.sources, hash, &cache.raw, &cache.packed))
        .transpose()?;
    let parent_hashes = current_version["parents"]
        .as_array()
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .map(|parent| {
            let parent = parent
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("file history parent"))?;
            let parent_version = version(reader, &mut cache.versions, parent)?;
            file_hash(&parent_version, file)
        })
        .collect::<io::Result<Vec<_>>>()?;
    let parent_file_hash = if parent_hashes
        .iter()
        .any(|parent| parent == &current_hash)
    {
        current_hash.clone()
    } else {
        parent_hashes.first().cloned().flatten()
    };
    Ok(json!({
        "log":log,
        "fileHash":current_hash,
        "parentFileHash":parent_file_hash,
        "contents":contents,
    }))
}

fn validate_file(file: &str) -> io::Result<()> {
    let path = Path::new(file);
    if file.trim().is_empty()
        || file.len() > 32768
        || file.contains('\\')
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(invalid("file history path"));
    }
    Ok(())
}

fn version(
    reader: &mut read_version::Reader<'_>,
    cache: &mut HashMap<String, Value>,
    hash: &str,
) -> io::Result<Value> {
    if let Some(version) = cache.get(hash) {
        return Ok(version.clone());
    }
    let version = reader.read(hash)?;
    cache.insert(hash.to_string(), version.clone());
    Ok(version)
}

fn file_hash(version: &Value, path: &str) -> io::Result<Option<String>> {
    let path = path.trim();
    let files = version["files"].as_array().ok_or_else(|| invalid("file history files"))?;
    let mut selected = None;
    for file in files {
        if file["relativePath"].as_str().map(str::trim) == Some(path) {
            if selected.is_some() {
                return Err(invalid("file history duplicate file"));
            }
            let hash = file["file"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("file history source"))?;
            merge_history::hash(hash)?;
            selected = Some(hash.to_string());
        }
    }
    Ok(selected)
}

fn source(
    directory: &Path,
    cache: &mut HashMap<String, String>,
    hash: &str,
    raw: &Budget,
    packed: &Budget,
) -> io::Result<String> {
    if let Some(contents) = cache.get(hash) {
        return Ok(contents.clone());
    }
    let reference = merge_history::hash(hash)?;
    let record = repository::read_source_shared(directory, reference, raw, packed)?;
    merge_transaction::reads::source(reference, &record)?;
    let contents =
        String::from_utf8(record.body).map_err(|_| invalid("file history binary source"))?;
    cache.insert(hash.to_string(), contents.clone());
    Ok(contents)
}

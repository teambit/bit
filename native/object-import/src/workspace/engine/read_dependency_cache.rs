mod freshness;
mod reader;

use super::{invalid, path};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Read {
    cache: PathBuf,
    key: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Freshness {
    root: PathBuf,
    files: Vec<PathBuf>,
    timestamp: f64,
}
pub(super) fn read(request: &Read) -> io::Result<(usize, Value)> {
    path(&request.cache)?;
    let key = request.key.trim();
    if key.is_empty() || key.len() > 4096 {
        return Err(invalid("dependency cache key limit"));
    }
    let cache = reader::read(&request.cache, key)?;
    Ok((1, json!({"cache":cache})))
}
pub(super) fn freshness(
    request: &Freshness,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    path(&request.root)?;
    if request.files.len() > 65536
        || !request.timestamp.is_finite()
        || request.timestamp.fract() != 0.0
        || request.timestamp.abs() > 9_007_199_254_740_991.0
    {
        return Err(invalid("dependency cache freshness limits"));
    }
    for file in &request.files {
        path(file)?;
    }
    let stale = freshness::stale(&request.root, &request.files, request.timestamp, pool)?;
    Ok((1, json!({"stale":stale})))
}

/// Read one entry of Bit's `cacache` dependency cache: `{ timestamp, data }`.
pub fn read_cache(cache: &std::path::Path, key: &str) -> io::Result<Option<Value>> {
    reader::read(cache, key)
}

/// Whether a component dir or one of `files` changed after `timestamp` (milliseconds).
pub fn cache_stale(
    root: &std::path::Path,
    files: &[PathBuf],
    timestamp: f64,
    pool: &rayon::ThreadPool,
) -> io::Result<bool> {
    freshness::stale(root, files, timestamp, pool)
}

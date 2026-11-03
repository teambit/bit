//! `cacache` dependency cache entry [`Read`] via [`reader`] and mtime [`Freshness`] via [`freshness`].

mod freshness;
mod reader;

use super::{invalid, path};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

/// Wire request for reading a single `cacache` dependency cache entry by `key`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Read {
    cache: PathBuf,
    key: String,
}
/// Wire request for checking whether any directory or file under `root` is newer than `timestamp`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Freshness {
    root: PathBuf,
    files: Vec<PathBuf>,
    timestamp: f64,
}
/// Reads a single `cacache` dependency cache entry for `request` ([`Read`]) via [`read_cache`] and wraps it in a wire response.
#[inline]
pub(super) fn read(request: &Read) -> io::Result<(usize, Value)> {
    let cache = read_cache(&request.cache, &request.key)?;
    Ok((1, json!({"cache":cache})))
}
/// Checks whether any directory or file in `request` ([`Freshness`]) is newer than `request.timestamp` via [`cache_stale`].
#[inline]
pub(super) fn freshness(
    request: &Freshness,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let stale = cache_stale(&request.root, &request.files, request.timestamp, pool)?;
    Ok((1, json!({"stale":stale})))
}

/// Read one entry of Bit's `cacache` dependency cache: `{ timestamp, data }`.
pub fn read_cache(cache: &std::path::Path, key: &str) -> io::Result<Option<Value>> {
    path(cache)?;
    let key = key.trim();
    if key.is_empty() || key.len() > 4096 || key.contains('\0') {
        return Err(invalid("dependency cache key limit"));
    }
    reader::read(cache, key)
}

/// Whether a component dir or one of `files` changed after `timestamp` (milliseconds).
pub fn cache_stale(
    root: &std::path::Path,
    files: &[PathBuf],
    timestamp: f64,
    pool: &rayon::ThreadPool,
) -> io::Result<bool> {
    path(root)?;
    if files.len() > 65536 || !valid_timestamp(timestamp) {
        return Err(invalid("dependency cache freshness limits"));
    }
    for file in files {
        path(file)?;
    }
    freshness::stale(root, files, timestamp, pool)
}

/// Returns `true` when `timestamp` is a non-negative integer millisecond value within safe `f64` bounds.
#[inline]
fn valid_timestamp(timestamp: f64) -> bool {
    timestamp.is_finite()
        && timestamp >= 0.0
        && timestamp.fract() == 0.0
        && timestamp <= 9_007_199_254_740_991.0
}

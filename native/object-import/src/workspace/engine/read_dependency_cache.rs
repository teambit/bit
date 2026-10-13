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
    if request.key.is_empty() || request.key.len() > 4096 {
        return Err(invalid("dependency cache key limit"));
    }
    let cache = reader::read(&request.cache, &request.key)?;
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

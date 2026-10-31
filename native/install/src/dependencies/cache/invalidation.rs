//! `dependencyCacheNeedsInvalidation`: the whole dependency cache is dropped when a
//! workspace-level file changed after its oldest entry was written. The component
//! loader of the TypeScript CLI runs it before loading components
//! (`ComponentLoader.invalidateDependenciesCache`); native status and install do too.

#[cfg(test)]
mod tests;

use super::hex;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// `<root>/.bit/cache/components/deps`, the workspace's dependency cache.
#[must_use]
pub fn deps_dir(root: &Path) -> PathBuf {
    crate::config::scope_path(root)
        .join("cache")
        .join("components")
        .join("deps")
}

/// `deleteAllDependenciesDataCache` of the dependency cache at `cache` when
/// [`needs_invalidation`]; whether it did.
pub fn invalidate(root: &Path, cache: &Path) -> io::Result<bool> {
    if !needs_invalidation(root, cache)? {
        return Ok(false);
    }
    match fs::remove_dir_all(cache) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(true),
    }
}

/// `dependencyCacheNeedsInvalidation(new FsCache(<scope>), root, workspace.jsonc)` for the
/// dependency cache at `cache`.
pub fn needs_invalidation(root: &Path, cache: &Path) -> io::Result<bool> {
    let names = [
        "node_modules",
        "package.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        ".bitmap",
        "workspace.jsonc",
    ];
    let mut last_modified = f64::NEG_INFINITY;
    for name in names {
        if let Some(mtime) = mtime_ms(&root.join(name))? {
            last_modified = last_modified.max(mtime);
        }
    }
    let first_entered = entry_times(cache)?.into_iter().fold(f64::INFINITY, js_min);
    Ok(last_modified > first_entered)
}

/// `Math.min`: `NaN` wins.
fn js_min(left: f64, right: f64) -> f64 {
    if left.is_nan() || right.is_nan() { f64::NAN } else { left.min(right) }
}

/// `fs.stat(path).mtimeMs`, `None` when the path does not exist.
fn mtime_ms(path: &Path) -> io::Result<Option<f64>> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let since = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?;
    Ok(Some((since.as_secs() as f64).mul_add(
        1000.0,
        f64::from(since.subsec_nanos()) / 1_000_000.0,
    )))
}

/// `cacache.ls(cache)`: the time of each key's latest entry that is not a
/// deletion. A non-numeric time is `NaN`, as `Math.min` would read it.
fn entry_times(cache: &Path) -> io::Result<Vec<f64>> {
    let mut times = Vec::new();
    for bucket in read_dir_or_empty(&cache.join("index-v5"))? {
        for sub_bucket in read_dir_or_empty(&bucket)? {
            for file in read_dir_or_empty(&sub_bucket)? {
                let text = String::from_utf8_lossy(&fs::read(&file)?).into_owned();
                times.extend(bucket_times(&text));
            }
        }
    }
    Ok(times)
}

/// `_bucketEntries`, reduced to the latest entry per key, deletions dropped.
fn bucket_times(text: &str) -> Vec<f64> {
    let mut latest: Vec<(Value, Value)> = Vec::new();
    for line in text
        .split('\n')
        .filter(|line| !line.is_empty())
    {
        let mut pieces = line.split('\t');
        let (Some(hash), Some(body)) = (pieces.next(), pieces.next()) else { continue };
        if body.is_empty() || hex(&Sha1::digest(body.as_bytes())) != hash {
            continue;
        }
        let Ok(entry) = serde_json::from_str::<Value>(body) else { continue };
        if !truthy(Some(&entry)) {
            continue;
        }
        let key = entry
            .get("key")
            .cloned()
            .unwrap_or(Value::Null);
        match latest
            .iter_mut()
            .find(|(known, _)| *known == key)
        {
            Some((_, existing)) => *existing = entry,
            None => latest.push((key, entry)),
        }
    }
    latest
        .into_iter()
        .filter(|(_, entry)| truthy(entry.get("integrity")))
        .map(|(_, entry)| {
            entry
                .get("time")
                .and_then(Value::as_f64)
                .unwrap_or(f64::NAN)
        })
        .collect()
}

/// `readdirOrEmpty`: missing directories and files read as empty.
fn read_dir_or_empty(dir: &Path) -> io::Result<Vec<PathBuf>> {
    match fs::read_dir(dir) {
        Ok(entries) => entries
            .map(|entry| entry.map(|entry| entry.path()))
            .collect(),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            Ok(Vec::new())
        }
        Err(error) => Err(error),
    }
}

/// JavaScript truthiness of a JSON value.
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(number)) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Some(Value::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

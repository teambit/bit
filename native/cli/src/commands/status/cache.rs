//! The workspace-wide dependency cache checks of the Node.js glue: the
//! `no-fs-cache` feature, and `dependencyCacheNeedsInvalidation`, which
//! compares the newest workspace-level change with the oldest cache entry.
//! Native status runs only when neither applies.

use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const NO_FS_CACHE: &str = "no-fs-cache";

/// Whether `no-fs-cache` may be enabled in any config layer: `BIT_FEATURES`,
/// `BIT_CONFIG_FEATURES`, the workspace's config store, `scope.json` or the
/// global config. Layer precedence is not resolved: a mention anywhere declines.
pub fn no_fs_cache(root: &Path) -> bool {
    let mentions = |value: &str| {
        value
            .split(',')
            .any(|feature| feature.trim() == NO_FS_CACHE)
    };
    let from_env = ["BIT_FEATURES", "BIT_CONFIG_FEATURES"]
        .iter()
        .any(|name| env::var(name).is_ok_and(|value| mentions(&value)));
    let files = [
        root.join("workspace.jsonc"),
        root.join(".bit").join("scope.json"),
        global_config_dir().join("config.json"),
    ];
    from_env
        || files
            .iter()
            .any(|file| fs::read_to_string(file).is_ok_and(|text| text.contains(NO_FS_CACHE)))
}

/// `GLOBAL_CONFIG` of `@teambit/legacy.constants`.
fn global_config_dir() -> PathBuf {
    cache_root().join("config")
}

/// `CACHE_ROOT` of `@teambit/legacy.constants`.
pub fn cache_root() -> PathBuf {
    let home = || {
        PathBuf::from(
            env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
        )
    };
    if let Some(dir) = env::var_os("BIT_GLOBALS_DIR").filter(|dir| !dir.is_empty()) {
        PathBuf::from(dir)
    } else if cfg!(any(target_os = "linux", target_os = "macos")) {
        home()
            .join("Library")
            .join("Caches")
            .join("Bit")
    } else if let Some(local) = env::var_os("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        PathBuf::from(local).join("Bit")
    } else {
        home().join(".bit")
    }
}

/// `dependencyCacheNeedsInvalidation(new FsCache(<root>/.bit), root, workspace.jsonc)`.
pub fn needs_invalidation(root: &Path) -> io::Result<bool> {
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
    let cache = root
        .join(".bit")
        .join("cache")
        .join("components")
        .join("deps");
    let first_entered = entry_times(&cache)?.into_iter().fold(f64::INFINITY, js_min);
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
        if !crate::commands::status::js::truthy(Some(&entry)) {
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
        .filter(|(_, entry)| crate::commands::status::js::truthy(entry.get("integrity")))
        .map(|(_, entry)| {
            entry
                .get("time")
                .and_then(Value::as_f64)
                .unwrap_or(f64::NAN)
        })
        .collect()
}

pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
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

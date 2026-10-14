//! Bit's dependency cache (`<scope>/cache/components/deps`): read when no file of
//! the component changed since it was written (`getDependenciesDataFromCacheIfPossible`),
//! written after a detection (`saveDependenciesDataInCache`).
//!
//! The cache is a `cacache` 20 store: an entry is appended to the index bucket
//! `index-v5/<sha256(key)>` as `\n<sha1(json)>\t<json>`, and the content lives at
//! `content-v2/sha512/<hex digest>`.

mod format;

use super::data::Detected;
use crate::{model::WorkspaceComponent, policy::scope::Scope};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use sha2::{Sha256, Sha512};
use std::{
    fmt::Write as _,
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// `BIT_FEATURES` entry disabling the filesystem cache (`NO_FS_CACHE_FEATURE`).
const NO_FS_CACHE: &str = "no-fs-cache";

/// The cached detection of `component`, when fresh.
pub fn read(
    scope: &Scope,
    component: &WorkspaceComponent,
    pool: &rayon::ThreadPool,
) -> io::Result<Option<Detected>> {
    let Some(entry) =
        bit_object_import::read_dependency_cache(&scope.dependency_cache(), &key(component))?
    else {
        return Ok(None);
    };
    let Some(timestamp) = entry["timestamp"].as_f64() else { return Ok(None) };
    let mut files: Vec<PathBuf> = component.files
        .iter()
        .map(|file| component.dir.join(file))
        .collect();
    files.push(component.dir.join("component.json"));
    if bit_object_import::dependency_cache_stale(&component.dir, &files, timestamp, pool)? {
        return Ok(None);
    }
    let data: Value = match entry["data"].as_str() {
        Some(text) => serde_json::from_str(text).map_err(io::Error::other)?,
        None => return Ok(None),
    };
    Ok(Some(Detected::from_cache(&data)))
}

/// `ComponentID.toString()`: `scope/name@version`, the version omitted for new components.
fn key(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version
        .as_deref()
        .filter(|version| !version.is_empty() && *version != "latest")
    {
        Some(version) => format!("{id}@{version}"),
        None => id,
    }
}

/// Whether the filesystem cache is disabled through `BIT_FEATURES`.
#[must_use]
pub fn disabled() -> bool {
    std::env::var("BIT_FEATURES")
        .is_ok_and(|features| {
            features
                .split(',')
                .any(|feature| feature.trim() == NO_FS_CACHE)
        })
}

/// Store the detection of `component` the way `saveDependenciesDataInCache` does,
/// so the TypeScript loader reads it back.
pub fn write(scope: &Scope, component: &WorkspaceComponent, detected: &Detected) -> io::Result<()> {
    put(&scope.dependency_cache(), &key(component), &format::serialize(detected).to_string())
}

/// `cacache.put(cache, key, data, { metadata: { timestamp } })`: the content
/// under its digest and an index entry appended to the key's bucket.
pub fn put(cache: &Path, key: &str, data: &str) -> io::Result<()> {
    let integrity = put_content(cache, data.as_bytes())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_millis();
    let entry = json!({
        "key": key,
        "integrity": integrity,
        "time": now,
        "size": data.len(),
        "metadata": { "timestamp": now },
    })
    .to_string();
    let bucket = segmented(&cache.join("index-v5"), &hex(&Sha256::digest(key.as_bytes())));
    fs::create_dir_all(bucket.parent().unwrap_or(cache))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&bucket)?;
    io::Write::write_all(
        &mut file,
        format!("\n{}\t{entry}", hex(&Sha1::digest(entry.as_bytes()))).as_bytes(),
    )
}

/// Write `data` under its sha512 digest, as `cacache` does: a temporary file moved
/// into place, left alone when the content already exists.
fn put_content(cache: &Path, data: &[u8]) -> io::Result<String> {
    let digest = Sha512::digest(data);
    let destination = segmented(&cache.join("content-v2").join("sha512"), &hex(&digest));
    if !destination.is_file() {
        let temporary = cache
            .join("tmp")
            .join(format!("{}-{}", std::process::id(), hex(&digest[..8])));
        fs::create_dir_all(destination.parent().unwrap_or(cache))?;
        fs::create_dir_all(temporary.parent().unwrap_or(cache))?;
        fs::write(&temporary, data)?;
        if let Err(error) = fs::rename(&temporary, &destination) {
            let _ = fs::remove_file(&temporary);
            if !destination.is_file() {
                return Err(error);
            }
        }
    }
    Ok(format!("sha512-{}", STANDARD.encode(digest)))
}

fn segmented(root: &Path, hash: &str) -> PathBuf {
    root.join(&hash[..2])
        .join(&hash[2..4])
        .join(&hash[4..])
}

/// Lowercase hex digits of `bytes`.
pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

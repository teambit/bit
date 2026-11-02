//! Bit's dependency cache (`<scope>/cache/components/deps`): read when no file of
//! the [`WorkspaceComponent`] changed since it was written (`getDependenciesDataFromCacheIfPossible`),
//! written after a [`Detected`] run (`saveDependenciesDataInCache`).
//!
//! The cache is a `cacache` 20 store: an entry is appended to the index bucket
//! `index-v5/<sha256(key)>` as `\n<sha1(json)>\t<json>`, and the content lives at
//! `content-v2/sha512/<hex digest>`.
//! Honors the [`NO_FS_CACHE`] (`no-fs-cache`) flag in `BIT_FEATURES` and [`invalidation`] checks.

pub mod invalidation;

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

/// Read the cached [`Detected`] dependency data of `component` from `<scope>/cache/components/deps` when fresh.
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
    let mut files = Vec::with_capacity(component.files.len() + 1);
    files.extend(
        component.files
            .iter()
            .map(|file| component.dir.join(file)),
    );
    files.push(component.dir.join("component.json"));
    if bit_object_import::dependency_cache_stale(&component.dir, &files, timestamp, pool)? {
        return Ok(None);
    }
    let data: Value = match entry["data"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        Some(text) => serde_json::from_str(text)
            .or_else(|_| bit_object_import::parse_jsonc(text.as_bytes()))
            .map_err(io::Error::other)?,
        None => return Ok(None),
    };
    Ok(Some(Detected::from_cache(&data)))
}

/// `ComponentID.toString()`: `scope/name@version`, the version omitted for new components.
#[inline]
fn key(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
    {
        Some(version) => format!("{id}@{version}"),
        None => id,
    }
}

/// Whether the filesystem cache is disabled through `BIT_FEATURES`.
#[inline]
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
#[inline]
pub fn write(scope: &Scope, component: &WorkspaceComponent, detected: &Detected) -> io::Result<()> {
    put(&scope.dependency_cache(), &key(component), &format::serialize(detected).to_string())
}

/// `cacache.put(cache, key, data, { metadata: { timestamp } })`: the content
/// under its digest and an index entry appended to the key's bucket.
pub fn put(cache: &Path, key: &str, data: &str) -> io::Result<()> {
    let key = key.trim();
    if key.is_empty()
        || cache
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
    {
        return Ok(());
    }
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
    append_index_entry(cache, key, &entry)
}

/// `cacache.rm.entry`: append a null-integrity tombstone without creating content.
pub fn remove_entry(cache: &Path, key: &str) -> io::Result<()> {
    let key = key.trim();
    if key.is_empty()
        || cache
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
    {
        return Ok(());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_millis();
    let entry = json!({"key":key,"integrity":null,"time":now}).to_string();
    append_index_entry(cache, key, &entry)
}

fn append_index_entry(cache: &Path, key: &str, entry: &str) -> io::Result<()> {
    let bucket = segmented(&cache.join("index-v5"), &hex(&Sha256::digest(key.as_bytes())));
    fs::create_dir_all(bucket.parent().unwrap_or(cache))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(bucket)?;
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

#[inline]
fn segmented(root: &Path, hash: &str) -> PathBuf {
    if hash.len() < 4 {
        return root.join(hash);
    }
    root.join(&hash[..2])
        .join(&hash[2..4])
        .join(&hash[4..])
}

/// Lowercase hex digits of `bytes`.
#[inline]
pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

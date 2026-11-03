//! Bounded `cacache` index-v5 and content-v2 reader via [`read`] with SHA-1/SHA-512 checks.

use super::invalid;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use sha2::{Sha256, Sha512};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

/// Maximum byte size permitted for a `cacache` index bucket or content blob.
const LIMIT: usize = 8 * 1024 * 1024;

/// Reads and verifies the latest `cacache` entry for `key` under `cache` ([`Path`]) via [`latest`] and [`content`].
pub(super) fn read(cache: &Path, key: &str) -> io::Result<Option<Value>> {
    let hashed = format!("{:x}", Sha256::digest(key.as_bytes()));
    let bucket = segmented(cache.join("index-v5"), &hashed);
    let Some(bytes) = bounded(&bucket)? else { return Ok(None) };
    let text = std::str::from_utf8(&bytes).map_err(|_| invalid("dependency cache index UTF-8"))?;
    let Some(entry) = latest(text, key)? else { return Ok(None) };
    let Some(integrity) = entry
        .get("integrity")
        .filter(|value| !falsy(value))
    else {
        return Ok(None);
    };
    let integrity = integrity
        .as_str()
        .map(str::trim)
        .filter(|integrity| !integrity.is_empty())
        .ok_or_else(|| invalid("dependency cache integrity type"))?;
    let Some(data) = content(cache, integrity)? else { return Ok(None) };
    let timestamp =
        entry["metadata"].get("timestamp").ok_or_else(|| invalid("dependency cache timestamp"))?;
    if !timestamp
        .as_f64()
        .is_some_and(|ts| {
            ts.is_finite() && ts >= 0.0 && ts.fract() == 0.0 && ts <= 9_007_199_254_740_991.0
        })
    {
        return Err(invalid("dependency cache timestamp"));
    }
    Ok(Some(json!({"timestamp":timestamp,"data":data})))
}
/// Reads and SHA-512 verifies the `content-v2` blob referenced by `integrity` under `cache` ([`Path`]) via [`segmented`].
fn content(cache: &Path, integrity: &str) -> io::Result<Option<String>> {
    let digest = integrity
        .strip_prefix("sha512-")
        .ok_or_else(|| invalid("dependency cache digest algorithm"))?;
    let digest =
        STANDARD.decode(digest).map_err(|_| invalid("dependency cache digest encoding"))?;
    if digest.len() != 64 {
        return Err(invalid("dependency cache digest length"));
    }
    let hex = digest
        .iter()
        .fold(String::with_capacity(128), |mut text, byte| {
            use std::fmt::Write;
            let _ = write!(text, "{byte:02x}");
            text
        });
    let Some(body) = bounded(&segmented(cache.join("content-v2/sha512"), &hex))? else {
        return Ok(None);
    };
    if Sha512::digest(&body).as_slice() != digest.as_slice() {
        return Err(invalid("dependency cache integrity mismatch"));
    }
    String::from_utf8(body).map(Some).map_err(|_| invalid("dependency cache body UTF-8"))
}

/// Appends the two-level `cacache` fan-out segments (`hash[..2]/hash[2..4]/hash[4..]`) to `path`.
#[inline]
fn segmented(mut path: PathBuf, hash: &str) -> PathBuf {
    path.push(&hash[..2]);
    path.push(&hash[2..4]);
    path.push(&hash[4..]);
    path
}
/// Returns `true` when `value` is `null`, `false`, `""`, or `0`.
#[inline]
fn falsy(value: &Value) -> bool {
    matches!(value, Value::Null | Value::Bool(false))
        || value.as_str() == Some("")
        || value == &json!(0)
}
fn latest(text: &str, key: &str) -> io::Result<Option<Value>> {
    let mut result = None;
    for (index, line) in text.split('\n').enumerate() {
        if index > 65536 {
            return Err(invalid("dependency cache index entries"));
        }
        let line = line.strip_suffix('\r').unwrap_or(line);
        let mut pieces = line.split('\t');
        let checksum = pieces.next().unwrap_or_default().trim();
        let Some(body) = pieces.next() else { continue };
        if pieces.next().is_some()
            || body.is_empty()
            || checksum.len() != 40
            || !checksum.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !format!("{:x}", Sha1::digest(body.as_bytes())).eq_ignore_ascii_case(checksum)
        {
            continue;
        }
        let entry: Value =
            serde_json::from_str(body).map_err(|_| invalid("dependency cache index JSON"))?;
        if entry["key"].as_str() == Some(key) {
            result = Some(entry);
        }
    }
    Ok(result)
}
fn bounded(path: &Path) -> io::Result<Option<Vec<u8>>> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || metadata.len() > LIMIT as u64 {
        return Err(invalid("dependency cache file limit"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    match fs::File::open(path) {
        Ok(file) => file
            .take(LIMIT as u64 + 1)
            .read_to_end(&mut bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if bytes.len() > LIMIT || bytes.len() as u64 != metadata.len() {
        return Err(invalid("dependency cache file changed"));
    }
    Ok(Some(bytes))
}

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

const LIMIT: usize = 8 * 1024 * 1024;

pub(super) fn read(cache: &Path, key: &str) -> io::Result<Option<Value>> {
    let hashed = format!("{:x}", Sha256::digest(key.as_bytes()));
    let bucket = segmented(&cache.join("index-v5"), &hashed);
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
    Ok(Some(json!({"timestamp":timestamp,"data":data})))
}
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
    let Some(body) = bounded(&segmented(&cache.join("content-v2/sha512"), &hex))? else {
        return Ok(None);
    };
    if Sha512::digest(&body).as_slice() != digest.as_slice() {
        return Err(invalid("dependency cache integrity mismatch"));
    }
    String::from_utf8(body).map(Some).map_err(|_| invalid("dependency cache body UTF-8"))
}

fn segmented(root: &Path, hash: &str) -> PathBuf {
    root.join(&hash[..2])
        .join(&hash[2..4])
        .join(&hash[4..])
}
fn falsy(value: &Value) -> bool {
    value.is_null()
        || value == &Value::Bool(false)
        || value == &json!(0)
        || value == &Value::String(String::new())
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
            || format!("{:x}", Sha1::digest(body.as_bytes())) != checksum
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
    let mut bytes = Vec::new();
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

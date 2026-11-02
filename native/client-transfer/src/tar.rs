//! The object stream framing of `ObjectList.fromObjectStreamToTar`: one tar
//! entry per compressed [`ObjectItem`] named `[scope/]hash`, between [`START`] (`.BIT.START`) and
//! [`END`] (`.BIT.END`) metadata entries. A [`ERROR`] (`.BIT.ERROR`) entry carries a server error.
//!
//! Packs and unpacks bounded object archives within [`MAX_ARCHIVE_BYTES`] without exposing raw byte buffers to Node.js.

#[cfg(test)]
mod tests;

use crate::{invalid, is_hash};
use serde_json::Value;
use std::io::{self, Read};

/// Sentinel tar entry name (`.BIT.START`) marking the start of a remote object stream.
const START: &str = ".BIT.START";
/// Sentinel tar entry name (`.BIT.END`) marking the end of a remote object stream.
const END: &str = ".BIT.END";
/// Sentinel tar entry name (`.BIT.ERROR`) carrying a remote server error payload.
const ERROR: &str = ".BIT.ERROR";
/// `OBJECT_LIST_CURRENT_SCHEMA`.
const SCHEMA: &str = "1.0.0";
pub const MAX_ARCHIVE_BYTES: usize = 512 * 1024 * 1024;
const MAX_OBJECT_BYTES: usize = 128 * 1024 * 1024;
const MAX_OBJECTS: usize = 16384;

/// A compressed object received from (or served by) a remote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectItem {
    pub hash: String,
    pub compressed: Vec<u8>,
    pub scope: Option<String>,
}

/// Frame an outbound object list without exposing object bodies to Node.
pub fn pack(items: &[ObjectItem], max_bytes: usize) -> io::Result<Vec<u8>> {
    if items.len() > MAX_OBJECTS || max_bytes > MAX_ARCHIVE_BYTES {
        return Err(invalid("remote push object bounds"));
    }
    let mut builder = ::tar::Builder::new(Vec::new());
    let mut total = 0usize;
    for item in items {
        let name = outbound_name(item)?;
        total = total
            .checked_add(item.compressed.len())
            .ok_or_else(|| invalid("remote push archive bounds"))?;
        if total > max_bytes {
            return Err(invalid("remote push archive bounds"));
        }
        let mut header = ::tar::Header::new_gnu();
        header.set_size(item.compressed.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder.append_data(&mut header, name, item.compressed.as_slice())?;
    }
    builder.finish()?;
    let bytes = builder.into_inner()?;
    if bytes.len() > max_bytes {
        return Err(invalid("remote push archive bounds"));
    }
    Ok(bytes)
}

#[inline]
fn valid_scope(scope: &str) -> bool {
    !scope.is_empty()
        && scope != "."
        && scope != ".."
        && scope
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

#[inline]
fn outbound_name(item: &ObjectItem) -> io::Result<String> {
    let hash = item.hash.trim();
    if !is_hash(hash) || item.compressed.len() > MAX_OBJECT_BYTES {
        return Err(invalid("remote push object identity or bytes"));
    }
    match item.scope.as_deref().map(str::trim) {
        Some(scope) if valid_scope(scope) => Ok(format!("{scope}/{hash}")),
        None => Ok(hash.to_owned()),
        _ => Err(invalid("remote push scope")),
    }
}

/// Parse a complete fetch response.
#[inline]
pub fn read(bytes: &[u8]) -> io::Result<Vec<ObjectItem>> {
    read_bounded(bytes, MAX_ARCHIVE_BYTES)
}

/// Parse while keeping both the archive and inflated entry allocation under
/// a caller-specific budget.
#[inline]
pub fn read_bounded(bytes: &[u8], max_bytes: usize) -> io::Result<Vec<ObjectItem>> {
    if max_bytes > MAX_ARCHIVE_BYTES || bytes.len() > max_bytes {
        return Err(invalid("remote fetch archive exceeds bounds"));
    }
    read_from(bytes, max_bytes)
}

/// Read tar entries incrementally; the transport separately bounds the complete archive.
pub fn read_from(reader: impl Read, max_bytes: usize) -> io::Result<Vec<ObjectItem>> {
    if max_bytes > MAX_ARCHIVE_BYTES {
        return Err(invalid("remote fetch archive exceeds bounds"));
    }
    let mut archive = ::tar::Archive::new(reader);
    let mut items = Vec::new();
    let mut start: Option<Value> = None;
    let mut ended = false;
    let mut total_bytes = 0usize;
    for entry in archive.entries()? {
        let mut entry = entry?;
        let (name, data) = read_entry(&mut entry, max_bytes, &mut total_bytes)?;
        match name.as_str() {
            ERROR => {
                return Err(io::Error::other(String::from_utf8_lossy(&data).trim().to_owned()));
            }
            START => start = Some(serde_json::from_slice(&data).map_err(io::Error::other)?),
            END => {
                let value: Value = serde_json::from_slice(&data).map_err(io::Error::other)?;
                ended = truthy(&value);
            }
            _ => {
                if items.len() >= MAX_OBJECTS {
                    return Err(invalid("remote fetch object count exceeds bounds"));
                }
                items.push(item(&name, data)?);
            }
        }
    }
    require_end(start, ended)?;
    Ok(items)
}

#[inline]
fn read_entry<Reader: Read>(
    entry: &mut ::tar::Entry<Reader>,
    max_bytes: usize,
    total_bytes: &mut usize,
) -> io::Result<(String, Vec<u8>)> {
    let limit = MAX_OBJECT_BYTES.min(max_bytes.saturating_sub(*total_bytes));
    if entry.size() > limit as u64 {
        return Err(invalid("remote fetch object exceeds bounds"));
    }
    let name = String::from_utf8_lossy(&entry.path_bytes())
        .trim_matches(|ch: char| ch.is_whitespace() || ch == '\0')
        .to_owned();
    let capacity = usize::try_from(entry.size())
        .unwrap_or(0)
        .min(64 * 1024);
    let mut data = Vec::with_capacity(capacity);
    entry
        .take(limit as u64 + 1)
        .read_to_end(&mut data)?;
    if data.len() > limit {
        return Err(invalid("remote fetch objects exceed bounds"));
    }
    *total_bytes += data.len();
    Ok((name, data))
}

#[inline]
fn require_end(start: Option<Value>, ended: bool) -> io::Result<()> {
    if start
        .as_ref()
        .is_some_and(|start| start["schema"].as_str().map(str::trim) == Some(SCHEMA))
        && !ended
    {
        let metadata = start.unwrap_or_default();
        return Err(io::Error::other(format!(
            "server terminated the stream unexpectedly (metadata: {metadata})",
        )));
    }
    Ok(())
}

#[inline]
fn item(name: &str, compressed: Vec<u8>) -> io::Result<ObjectItem> {
    let trimmed = name.trim();
    let (scope, hash) = match trimmed.split_once('/') {
        Some((scope, hash)) => (Some(scope.trim().to_string()), hash.trim()),
        None => (None, trimmed),
    };
    if !is_hash(hash)
        || scope
            .as_deref()
            .is_some_and(|sc| !valid_scope(sc))
    {
        return Err(invalid(&format!("invalid object ref: {name:?}")));
    }
    Ok(ObjectItem { hash: hash.to_string(), compressed, scope })
}

#[inline]
pub(crate) fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|number| number != 0.0 && !number.is_nan()),
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

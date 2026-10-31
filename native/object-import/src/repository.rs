//! Bounded repository metadata reads shared by VCS operations and diagnostics.
use crate::{checkout::repository, merge_history};
use serde_json::Value;
use std::{io, path::Path};

/// Read a scope object through the repository decoder. Missing files return `None`;
/// malformed headers, compressed data and over-budget objects are errors. Source
/// bodies are never projected into the diagnostic JSON metadata.
pub fn read_scope_object(scope: &Path, identity: &str) -> io::Result<Option<(String, Value)>> {
    read_object_directory(&scope.join("objects"), identity)
}

/// Decode metadata from a repository object directory, including its trash or pending directory.
/// Missing objects return `None`; the normal repository size and header checks still apply.
pub fn read_object_directory(
    directory: &Path,
    identity: &str,
) -> io::Result<Option<(String, Value)>> {
    let hash = merge_history::hash(identity)?;
    let raw = match repository::read(directory, hash, 32 * 1024 * 1024, &mut 0) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let kind = raw
        .split(|byte| *byte == b' ')
        .next()
        .and_then(|bytes| std::str::from_utf8(bytes).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid object header"))?;
    let (_, body) = repository::split(&raw, hash, kind)?;
    let value = if matches!(
        kind,
        "Component"
            | "Symlink"
            | "Version"
            | "Lane"
            | "ScopeMeta"
            | "VersionHistory"
            | "LaneHistory",
    ) {
        crate::parse_jsonc(body)?
    } else {
        Value::Null
    };
    Ok(Some((kind.to_owned(), value)))
}

/// Read the raw header parts and uncompressed body of a scope object by 40-char hex hash.
pub fn read_raw_scope_object(
    scope: &Path,
    identity: &str,
) -> io::Result<Option<(Vec<String>, Vec<u8>)>> {
    let hash = merge_history::hash(identity)?;
    let raw = match repository::read(&scope.join("objects"), hash, 32 * 1024 * 1024, &mut 0) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let end = raw
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing object header"))?;
    let header_str = std::str::from_utf8(&raw[..end])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "object header is not UTF-8"))?;
    let headers = header_str
        .split(' ')
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let kind = headers
        .first()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid object header"))?;
    let (_, body) = repository::split(&raw, hash, kind)?;
    Ok(Some((headers, body.to_vec())))
}

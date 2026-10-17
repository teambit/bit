//! Bounded repository metadata reads shared by VCS operations and diagnostics.
use crate::{checkout::repository, merge_history};
use serde_json::Value;
use std::{io, path::Path};

/// Read a scope object through the repository decoder. Missing files return `None`;
/// malformed headers, compressed data and over-budget objects are errors. Source
/// bodies are never projected into the diagnostic JSON metadata.
pub fn read_scope_object(scope: &Path, identity: &str) -> io::Result<Option<(String, Value)>> {
    let hash = merge_history::hash(identity)?;
    let raw = match repository::read(&scope.join("objects"), hash, 32 * 1024 * 1024, &mut 0) {
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
    let value = if matches!(kind, "Component" | "Symlink" | "Version" | "Lane") {
        serde_json::from_slice(body).map_err(io::Error::other)?
    } else {
        Value::Null
    };
    Ok(Some((kind.to_owned(), value)))
}

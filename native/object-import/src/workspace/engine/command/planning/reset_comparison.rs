//! A reset can discard [`incomplete`] working files only when [`prove_changed`] shows their
//! retained hashes differ independently of dependency metadata. Equal files still need
//! the full semantic comparison; this is never a substitute dependency graph.

#[cfg(test)]
mod tests;
use super::super::invalid;
use serde_json::Value;
use std::{collections::BTreeMap, io};

/// Returns `true` when `current` contains only a `mainFile` entry without full dependency metadata.
#[inline]
pub(super) fn incomplete(current: &Value) -> bool {
    current
        .as_object()
        .is_some_and(|fields| fields.len() == 1 && fields.contains_key("mainFile"))
}

/// Verifies that the working `Source` hashes in `current` differ from the stored hashes in `version`.
#[inline]
pub(super) fn prove_changed(current: &Value, version: &Value) -> io::Result<()> {
    if files(current, false)? == files(&version["files"], true)? {
        return Err(invalid("reset unchanged Sources require complete metadata"));
    }
    Ok(())
}

/// Collects a map from validated relative path to 20-byte `Source` SHA-1 digest from `value`.
#[inline]
fn files(value: &Value, model: bool) -> io::Result<BTreeMap<&str, [u8; 20]>> {
    let mut files = BTreeMap::new();
    for row in value.as_array().ok_or_else(|| invalid("reset Source comparison files"))? {
        let path = row["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("reset Source comparison path"))?;
        crate::checkout::plan::relative_path(path)?;
        // The canonical comparison ignores a stored bitmap outside workspace-root components.
        if model && path == ".bitmap" {
            continue;
        }
        let hash = row["file"]
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
            .ok_or_else(|| invalid("reset Source comparison hash"))?;
        let digest = crate::merge_history::hash(hash)?;
        if files.insert(path, digest).is_some() {
            return Err(invalid("reset duplicate Source comparison path"));
        }
    }
    Ok(files)
}

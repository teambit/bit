//! Retained file [`proof`] and owned path [`capture`] for [`Captured`] snapshot sources.

#[cfg(test)]
mod tests;

use super::super::{capture::Captured, invalid, proof};
use crate::workspace::snapshots;
use serde_json::Value;
use std::{io, path::Path};

/// Captures file content proofs for all source files across `current` [`Captured`] components.
#[inline]
pub(in crate::workspace::engine::command) fn capture(
    current: &[Captured],
    snapshots: &snapshots::State,
) -> io::Result<Vec<proof::Proof>> {
    current
        .iter()
        .flat_map(|component| {
            component.files
                .as_array()
                .into_iter()
                .flatten()
        })
        .map(|file| retain(file, snapshots))
        .collect()
}
/// Verifies the retained source snapshot for `file` and constructs its content [`proof::Proof`].
#[inline]
fn retain(file: &Value, snapshots: &snapshots::State) -> io::Result<proof::Proof> {
    let path = Path::new(
        file["path"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("resolve source path"))?,
    );
    let token = file["readToken"].as_u64().ok_or_else(|| invalid("resolve retained token"))?;
    let raw = file["rawHash"]
        .as_str()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .ok_or_else(|| invalid("resolve retained hash"))?;
    let observed =
        snapshots.get(token, path, raw).ok_or_else(|| invalid("resolve retained source"))?;
    let bom_buf;
    let bytes: &[u8] = if observed.raw_bytes == observed.contents.len() + 3 {
        let mut buf = Vec::with_capacity(observed.raw_bytes);
        buf.extend_from_slice(&[239, 187, 191]);
        buf.extend_from_slice(&observed.contents);
        bom_buf = buf;
        &bom_buf
    } else {
        &observed.contents
    };
    if crate::workspace::engine::hash(bytes) != raw {
        return Err(invalid("resolve retained source integrity"));
    }
    Ok(proof::content(path, bytes))
}

#[inline]
pub(super) fn owned_paths(
    root: &Path,
    current: &[Value],
    materials: &[super::super::resolve_snapshot::Material],
) -> std::collections::HashSet<std::path::PathBuf> {
    current
        .iter()
        .filter(|row| {
            row["identity"]
                .as_str()
                .map(str::trim)
                .is_some_and(|identity| {
                    materials
                        .iter()
                        .any(|material| material.identity.trim() == identity)
                })
        })
        .flat_map(|row| {
            let dir = row["directory"].as_str().map_or("", str::trim);
            let dir = dir
                .strip_prefix("./")
                .or_else(|| dir.strip_prefix(r".\"))
                .unwrap_or(dir)
                .trim_end_matches(['/', '\\']);
            let directory = root.join(dir);
            row["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|file| !file.is_empty())
                .map(move |file| directory.join(file))
        })
        .collect()
}

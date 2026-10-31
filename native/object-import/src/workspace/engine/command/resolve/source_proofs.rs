#[cfg(test)]
mod tests;

use super::super::{capture::Captured, invalid, proof};
use crate::workspace::snapshots;
use serde_json::Value;
use std::{io, path::Path};

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
    let mut bytes = Vec::new();
    if observed.raw_bytes == observed.contents.len() + 3 {
        bytes.extend_from_slice(&[239, 187, 191]);
    }
    bytes.extend_from_slice(&observed.contents);
    if crate::workspace::engine::hash(&bytes) != raw {
        return Err(invalid("resolve retained source integrity"));
    }
    Ok(proof::content(path, &bytes))
}

pub(super) fn owned_paths(
    root: &Path,
    current: &[Value],
    materials: &[super::super::resolve_snapshot::Material],
) -> std::collections::HashSet<std::path::PathBuf> {
    current
        .iter()
        .filter(|row| {
            materials
                .iter()
                .any(|material| material.identity == row["identity"])
        })
        .flat_map(|row| {
            let directory = root.join(row["directory"].as_str().unwrap_or(""));
            row["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(move |file| directory.join(file))
        })
        .collect()
}

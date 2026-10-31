#[cfg(test)]
mod tests;

use super::{Captured, comparison, invalid, snapshots};
use crate::workspace::engine::{command::repository::Repository, status_models::harmony};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// Hidden lane dependents are `ConsumerComponents` loaded from object storage.
/// Paths are private token keys only; they must never enter workspace inventory
/// or materialization. Repository object proofs bind all retained Source bytes.
pub(in crate::workspace::engine::command) fn from_model(
    private_root: &Path,
    identity: &str,
    version: &str,
    value: &Value,
    repository: &mut Repository,
    state: &mut snapshots::State,
) -> io::Result<Captured> {
    crate::merge_history::hash(version)?;
    let current = harmony::project(value)?;
    let rows = current["files"]
        .as_array()
        .filter(|rows| !rows.is_empty() && rows.len() <= 4096)
        .ok_or_else(|| invalid("hidden lane files"))?;
    let references = rows
        .iter()
        .map(|row| {
            row["file"]
                .as_str()
                .map(str::trim)
                .filter(|reference| !reference.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("hidden Source reference"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let contents = repository.source_batch(&references)?;
    let (files, paths) = retain_files(private_root, version.trim(), rows, contents, state)?;
    Ok(Captured {
        added: false,
        hidden: true,
        model_backed: true,
        target: comparison::Target {
            source_overlays: std::collections::HashMap::new(),
            source_overlay_root: None,
            identity: identity.into(),
            version: version.into(),
            directory: String::new(),
            files: paths,
            current: current.clone(),
        },
        metadata: current["files"].clone(),
        files: json!(files),
    })
}

fn retain_files(
    private_root: &Path,
    version: &str,
    rows: &[Value],
    contents: Vec<Vec<u8>>,
    state: &mut snapshots::State,
) -> io::Result<(Vec<Value>, Vec<String>)> {
    let mut files = Vec::new();
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    for (row, bytes) in rows.iter().zip(contents) {
        let relative = row["relativePath"].as_str().ok_or_else(|| invalid("hidden file path"))?;
        validate_relative(relative, &mut seen)?;
        let reference = row["file"].as_str().ok_or_else(|| invalid("hidden Source reference"))?;
        let hash = crate::workspace::engine::hash(&bytes);
        if hash != reference {
            return Err(invalid("hidden lane Source hash mismatch"));
        }
        let path = private_root.join(version).join(relative);
        let token = state
            .retain(snapshots::Observation {
                path: path.clone(),
                raw_hash: hash.clone(),
                snapshot_hash: hash.clone(),
                raw_bytes: bytes.len(),
                contents: bytes.into(),
            })
            .ok_or_else(|| invalid("hidden lane Source retention"))?;
        files.push(json!({"relativePath":relative,"path":path,"rawHash":hash,"snapshotHash":hash,
            "readToken":token,"protected":false}));
        paths.push(relative.to_owned());
    }
    Ok((files, paths))
}

fn validate_relative(relative: &str, seen: &mut HashSet<String>) -> io::Result<()> {
    if relative
        .split('/')
        .any(|part| part.is_empty() || matches!(part, "." | ".."))
        || relative.contains(['\\', ':', '\0'])
        || !seen.insert(relative.to_owned())
    {
        return Err(invalid("hidden lane file path"));
    }
    Ok(())
}

use super::{Material, invalid, snapshot};
use crate::workspace::snapshots;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Reject unsupported or stale inputs before the caller allocates UUIDs and logs.
pub(in crate::workspace::engine::command) fn preflight(
    root: &Path,
    materials: &[Material],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    if materials.is_empty() || materials.len() > 4096 {
        return Err(invalid("resolve material count"));
    }
    let mut seen = HashSet::new();
    let mut bytes = 0usize;
    for material in materials {
        if !seen.insert(material.identity.as_str()) {
            return Err(invalid("resolve duplicate material"));
        }
        validate_identity(material)?;
        validate_projection(material)?;
        validate_graph(root, material)?;
        bytes = bytes
            .checked_add(validate_files(material, snapshots)?)
            .ok_or_else(|| invalid("resolve file budget"))?;
    }
    if bytes > snapshots::MAX_BYTES {
        return Err(invalid("resolve source budget"));
    }
    Ok(())
}

fn validate_identity(material: &Material) -> io::Result<()> {
    if !material.current_head.is_empty() {
        crate::merge_history::hash(&material.current_head)?;
    }
    if let Some(pending) = &material.pending {
        let head = pending["head"].as_str().ok_or_else(|| invalid("resolve pending head"))?;
        crate::merge_history::hash(head)?;
        if pending["laneId"]["scope"].as_str().is_none()
            || pending["laneId"]["name"].as_str().is_none()
        {
            return Err(invalid("resolve pending lane"));
        }
    }
    Ok(())
}

fn validate_projection(material: &Material) -> io::Result<()> {
    let projected = crate::workspace::engine::status_models::harmony::project(&material.version)?;
    if !projected["extensions"].is_array() || !projected["files"].is_array() {
        return Err(invalid("resolve Version projection"));
    }
    snapshot::validate_application_files(&material.files)
}

fn validate_graph(root: &Path, material: &Material) -> io::Result<()> {
    if material.version.get("flattenedEdges").is_some() {
        return Ok(());
    }
    let old =
        material.version["flattenedEdgesRef"].as_str().ok_or_else(|| invalid("resolve graph"))?;
    crate::merge_history::hash(old)?;
    if !root
        .join(".bit/objects")
        .join(&old[..2])
        .join(&old[2..])
        .try_exists()?
    {
        return Err(invalid("resolve graph absent"));
    }
    Ok(())
}

fn validate_files(material: &Material, snapshots: &snapshots::State) -> io::Result<usize> {
    material.files
        .iter()
        .map(|file| validate_file(file, snapshots))
        .try_fold(0usize, |total, size| {
            total
                .checked_add(size?)
                .ok_or_else(|| invalid("resolve file budget"))
        })
}

fn validate_file(file: &Value, snapshots: &snapshots::State) -> io::Result<usize> {
    let path = file["path"].as_str().ok_or_else(|| invalid("resolve file path"))?;
    let raw = file["rawHash"].as_str().ok_or_else(|| invalid("resolve raw hash"))?;
    let token = file["readToken"].as_u64().ok_or_else(|| invalid("resolve file token"))?;
    let observed = snapshots
        .get(token, Path::new(path), raw)
        .ok_or_else(|| invalid("resolve lost capture"))?;
    if observed.snapshot_hash != file["snapshotHash"] {
        return Err(invalid("resolve capture content"));
    }
    Ok(observed.contents.len())
}

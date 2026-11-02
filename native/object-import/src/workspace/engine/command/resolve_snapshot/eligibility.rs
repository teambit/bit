//! [`preflight`] [`Material`], graph, and file budget validation for resolved snapshots.
//! Enforces unique component identities, valid projections, and total source byte budgets.

use super::{Material, invalid, snapshot};
use crate::workspace::snapshots;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Reject unsupported or stale inputs before the caller allocates UUIDs and logs.
pub(in crate::workspace::engine::command) fn preflight(
    root: &Path,
    materials: &[Material],
    snapshots: &snapshots::State,
    ordinary_snapshot: bool,
) -> io::Result<()> {
    if materials.is_empty() || materials.len() > 4096 {
        return Err(invalid("resolve material count"));
    }
    let mut seen = HashSet::with_capacity(materials.len());
    let mut bytes = 0usize;
    for material in materials {
        let identity = material.identity.trim();
        if identity.is_empty() || !seen.insert(identity) {
            return Err(invalid("resolve duplicate material"));
        }
        validate_identity(material)?;
        validate_projection(material, ordinary_snapshot)?;
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

/// Validates semantic tag uniqueness, current head hashes, and pending merge state on `material` ([`Material`]).
fn validate_identity(material: &Material) -> io::Result<()> {
    if let Some(tag) = &material.version_state.tagged_version {
        let tag = tag.trim();
        if material.hidden
            || tag.is_empty()
            || material.model["versions"].get(tag).is_some()
            || material.model["orphanedVersions"].get(tag).is_some()
        {
            return Err(invalid("tag invalid semantic allocation"));
        }
    }

    if !material.version_state.current_head.is_empty() {
        crate::merge_history::hash(&material.version_state.current_head)?;
    }
    if let Some(pending) = &material.pending {
        let head = pending["head"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("resolve pending head"))?;
        crate::merge_history::hash(head)?;
        if crate::command_import::lane::parse_lane_id(&pending["laneId"]).is_err() {
            return Err(invalid("resolve pending lane"));
        }
    }
    Ok(())
}

/// Validates Harmony `Version` projection fields (`extensions`, `files`) and application file rules on `material`.
#[inline]
fn validate_projection(material: &Material, ordinary_snapshot: bool) -> io::Result<()> {
    let projected = crate::workspace::engine::status_models::harmony::project(&material.version)?;
    if !projected["extensions"].is_array() || !projected["files"].is_array() {
        return Err(invalid("resolve Version projection"));
    }
    if ordinary_snapshot { Ok(()) } else { snapshot::validate_application_files(&material.files) }
}

/// Validates that `material.version` carries either inline `flattenedEdges` or an existing `flattenedEdgesRef` object.
#[inline]
fn validate_graph(root: &Path, material: &Material) -> io::Result<()> {
    if material.version.get("flattenedEdges").is_some() {
        return Ok(());
    }
    let old = material.version["flattenedEdgesRef"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("resolve graph"))?;
    crate::merge_history::hash(old)?;
    if !crate::scope_path(root)
        .join("objects")
        .join(&old[..2])
        .join(&old[2..])
        .try_exists()?
    {
        return Err(invalid("resolve graph absent"));
    }
    Ok(())
}

#[inline]
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

#[inline]
fn validate_file(file: &Value, snapshots: &snapshots::State) -> io::Result<usize> {
    let path = file["path"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| invalid("resolve file path"))?;
    let raw = file["rawHash"]
        .as_str()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .ok_or_else(|| invalid("resolve raw hash"))?;
    let token = file["readToken"].as_u64().ok_or_else(|| invalid("resolve file token"))?;
    let observed = snapshots
        .get(token, Path::new(path), raw)
        .ok_or_else(|| invalid("resolve lost capture"))?;
    if observed.snapshot_hash != file["snapshotHash"].as_str().map_or("", str::trim) {
        return Err(invalid("resolve capture content"));
    }
    Ok(observed.contents.len())
}

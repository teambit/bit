//! Read the local remote-lane ref that bounds reset's removable snap chain.

use super::{BitmapState, Repository, invalid};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn remote_head(
    root: &Path,
    lane_scope: &str,
    lane_name: &str,
    scope: &str,
    name: &str,
) -> io::Result<Option<String>> {
    if [lane_scope, lane_name]
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == ".." || part.contains(['/', '\\']))
    {
        return Err(invalid("lane reset remote ref path"));
    }
    let path = root
        .join(".bit/refs/remotes")
        .join(lane_scope)
        .join(lane_name);
    let bytes = fs::read(path)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("lane reset remote refs oversized"));
    }
    let refs: Value = serde_json::from_slice(&bytes)?;
    let rows = refs
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("lane reset remote refs"))?;
    let mut found = None;
    for row in rows {
        if row["id"]["scope"] == scope && row["id"]["name"] == name {
            let head = row["head"].as_str().ok_or_else(|| invalid("lane reset remote head"))?;
            crate::merge_history::hash(head)?;
            if found.replace(head.to_owned()).is_some() {
                return Err(invalid("lane reset duplicate remote head"));
            }
        }
    }
    Ok(found)
}

pub(super) fn exported_head(
    root: &Path,
    bitmap: &BitmapState,
    scope: &str,
    name: &str,
) -> io::Result<Option<String>> {
    if !bitmap.exported {
        return Ok(None);
    }
    remote_head(root, &bitmap.lane_scope, &bitmap.lane_name, scope, name)
}

pub(super) fn reached_boundary(repository: &Repository, next: Option<&str>) -> io::Result<bool> {
    let Some(next) = next else {
        return Ok(true);
    };
    Ok(repository.heads.is_remote(next) || !repository.is_lane_origin(next)?)
}

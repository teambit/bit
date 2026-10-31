//! Read the local remote-lane ref that bounds reset's removable snap chain.

use super::{BitmapState, invalid, proofs};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn remote_head(
    root: &Path,
    lane_scope: &str,
    lane_name: &str,
    scope: &str,
    name: &str,
    reads: &mut proofs::ReadSet,
) -> io::Result<Option<String>> {
    if [lane_scope, lane_name]
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == ".." || part.contains(['/', '\\']))
    {
        return Err(invalid("lane reset remote ref path"));
    }
    let path = crate::scope_path(root)
        .join("refs/remotes")
        .join(lane_scope)
        .join(lane_name);
    let Some(bytes) = proofs::read(&path, reads)? else { return Ok(None) };
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("lane reset remote refs oversized"));
    }
    let refs: Value = crate::parse_jsonc(&bytes)?;
    let rows = refs
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("lane reset remote refs"))?;
    head_for(rows, scope, name)
}

fn head_for(rows: &[Value], scope: &str, name: &str) -> io::Result<Option<String>> {
    let mut found = None;
    for row in rows {
        let (row_scope, row_name) = super::row_id_parts(&row["id"]);
        if (row_scope == scope || row_scope.is_empty()) && row_name == name {
            let head = row["head"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("lane reset remote head"))?;
            let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
            if found.replace(canonical).is_some() {
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
    reads: &mut proofs::ReadSet,
) -> io::Result<Option<String>> {
    if !bitmap.exported {
        return Ok(None);
    }
    remote_head(root, &bitmap.lane_scope, &bitmap.lane_name, scope, name, reads)
}

/// `populateLocalAndRemoteHeads` prefers the lane ref, then a new lane's fork ref.
pub(super) fn baseline(
    root: &Path,
    bitmap: &BitmapState,
    lane: &Value,
    model: &Value,
    identity: (&str, &str),
    lane_remote: Option<&str>,
    reads: &mut proofs::ReadSet,
) -> io::Result<Option<String>> {
    let (scope, name) = identity;
    if let Some(head) = lane_remote {
        return Ok(Some(head.to_owned()));
    }
    if !bitmap.exported
        && let Some(fork) = lane
            .get("forkedFrom")
            .filter(|val| !val.is_null())
    {
        let (fork_scope, fork_name) = super::row_id_parts(fork);
        if fork_scope.is_empty() || fork_name.is_empty() {
            return Err(invalid("lane reset fork scope"));
        }
        if let Some(head) = remote_head(root, fork_scope, fork_name, scope, name, reads)? {
            return Ok(Some(head));
        }
        if fork_scope != bitmap.lane_scope {
            return Ok(None);
        }
    }
    Ok(remote_head(root, scope, "main", scope, name, reads)?
        .or_else(|| {
            model["head"]
                .as_str()
                .and_then(|head| crate::merge_history::hash(head.trim()).ok())
                .map(|bytes| crate::validate::hexadecimal(&bytes))
        }))
}

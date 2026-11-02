//! Read the local remote-lane ref ([`remote_head`]) that bounds reset's removable snap chain.

use super::{BitmapState, invalid, proofs};
use serde_json::Value;
use std::{io, path::Path};

/// Reads the local remote-tracking ref hash for `(scope, name)` on `(lane_scope, lane_name)`.
pub(super) fn remote_head(
    root: &Path,
    lane_scope: &str,
    lane_name: &str,
    scope: &str,
    name: &str,
    reads: &mut proofs::ReadSet,
) -> io::Result<Option<String>> {
    let (lane_scope, lane_name) = (lane_scope.trim(), lane_name.trim());
    if [lane_scope, lane_name]
        .iter()
        .any(|part| {
            part.is_empty() || *part == "." || *part == ".." || part.contains(['/', '\\', '\0'])
        })
    {
        return Err(invalid("lane reset remote ref path"));
    }
    let scope_dir = crate::scope_path(root);
    let mut found = None;
    for dir in ["refs/remotes", "refs/remote"] {
        let path = scope_dir
            .join(dir)
            .join(lane_scope)
            .join(lane_name);
        if let Some(bytes) = proofs::read(&path, reads)? {
            found = Some(bytes);
            break;
        }
    }
    let Some(bytes) = found else { return Ok(None) };
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

/// Finds the unique `head` hash for `(scope, name)` in a remote-lane ref `rows` array.
fn head_for(rows: &[Value], scope: &str, name: &str) -> io::Result<Option<String>> {
    let mut found = None;
    for row in rows {
        let (row_scope, row_name) = super::row_id_parts(&row["id"]);
        if (row_scope == scope || row_scope.is_empty()) && row_name == name {
            let head = row["head"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("lane reset remote head"))?;
            let digest = crate::merge_history::hash(head)?;
            if found.replace(digest).is_some() {
                return Err(invalid("lane reset duplicate remote head"));
            }
        }
    }
    Ok(found.map(|digest| crate::validate::hexadecimal(&digest)))
}

#[inline]
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
        && let Some((fork_scope, fork_name)) = fork_parts(lane)?
    {
        if let Some(head) = remote_head(root, fork_scope, fork_name, scope, name, reads)? {
            return Ok(Some(head));
        }
        if fork_scope != bitmap.lane_scope {
            return Ok(None);
        }
    }
    if let Some(head) = remote_head(root, scope, "main", scope, name, reads)? {
        return Ok(Some(head));
    }
    model_head(model)
}

fn fork_parts(lane: &Value) -> io::Result<Option<(&str, &str)>> {
    let Some(fork) = lane
        .get("forkedFrom")
        .filter(|val| !val.is_null())
    else {
        return Ok(None);
    };
    let (fork_scope, fork_name) = super::row_id_parts(fork);
    if fork_scope.is_empty() || fork_name.is_empty() {
        return Err(invalid("lane reset fork scope"));
    }
    Ok(Some((fork_scope, fork_name)))
}

fn model_head(model: &Value) -> io::Result<Option<String>> {
    let Some(raw_head) = model
        .get("head")
        .filter(|val| !val.is_null())
    else {
        return Ok(None);
    };
    let head_str = raw_head
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("lane reset model head"))?;
    let bytes = crate::merge_history::hash(head_str)?;
    Ok(Some(crate::validate::hexadecimal(&bytes)))
}

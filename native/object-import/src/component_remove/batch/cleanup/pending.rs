//! `Repository.deleteRecordsFromUnmergedComponents` writes ([`prepare`], [`matches_selected_record`]) when a removed model had a pending record.
//!
//! Preserves trailing newline and CRLF/LF line endings when updating `.bit/unmerged.json` during removal.
use super::{Change, read_optional};
use crate::component_remove::{Selected, invalid};
use serde_json::Value;
use std::{io, path::Path};
/// Prepares an `unmerged.json` edit removing records for `selected` components when present.
pub(super) fn prepare(root: &Path, selected: &[Selected]) -> io::Result<Option<Change>> {
    let path = crate::scope_path(root).join("unmerged.json");
    let Some(before) = read_optional(&path)? else { return Ok(None) };
    let mut value: Value = crate::parse_jsonc(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("unmerged component records"))?;
    let length = rows.len();
    rows.retain(|row| !matches_selected_record(row, selected));
    if rows.len() == length {
        return Ok(None);
    }
    let mut text = serde_json::to_string_pretty(&value)?;
    if before.ends_with(b"\n") {
        text.push('\n');
    }
    if before
        .windows(2)
        .any(|window| window == b"\r\n")
    {
        text = text.replace('\n', "\r\n");
    }
    Ok(Some(Change { path, before, after: text.into_bytes() }))
}

/// Return `true` when an `unmerged.json` record `row` matches any versioned component in `selected`.
#[inline]
fn matches_selected_record(row: &Value, selected: &[Selected]) -> bool {
    let (entry_scope, entry_name) = crate::component_remove::lane::lane_id_parts(&row["id"]);
    selected
        .iter()
        .any(|entry| {
            if entry.version
                .as_deref()
                .is_none_or(|version| version.trim().is_empty())
            {
                return false;
            }
            let identity = entry.identity.trim();
            let (scope, name) = identity
                .split_once('/')
                .map_or(("", identity), |(scope, name)| (scope.trim(), name.trim()));
            entry_name == name && (entry_scope == scope || entry_scope.is_empty())
        })
}

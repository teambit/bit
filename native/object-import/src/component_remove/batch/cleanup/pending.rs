//! Repository.deleteRecordsFromUnmergedComponents writes only when a removed model had a record.
use super::{Change, read_optional};
use crate::component_remove::{Selected, invalid};
use serde_json::Value;
use std::{io, path::Path};
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

fn matches_selected_record(row: &Value, selected: &[Selected]) -> bool {
    selected
        .iter()
        .filter(|entry| {
            entry.version
                .as_deref()
                .is_some_and(|version| !version.trim().is_empty())
        })
        .any(|entry| {
            let identity = entry.identity.trim();
            let (scope, name) = identity
                .split_once('/')
                .map_or(("", identity), |(scope, name)| (scope.trim(), name.trim()));
            crate::component_remove::lane::matches_component_entry(row, scope, name)
        })
}

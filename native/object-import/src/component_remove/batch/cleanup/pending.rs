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
    rows.retain(|row| {
        !selected
            .iter()
            .filter(|selected| selected.version.is_some())
            .any(|selected| {
                let identity = selected.identity.trim();
                let (scope, name) = identity
                    .split_once('/')
                    .map_or(("", identity), |(scope, name)| (scope.trim(), name.trim()));
                crate::component_remove::lane::matches_component_entry(row, scope, name)
            })
    });
    if rows.len() == length {
        return Ok(None);
    }
    let mut after = serde_json::to_vec_pretty(&value)?;
    if before.ends_with(b"\n") {
        after.push(b'\n');
    }
    Ok(Some(Change { path, before, after }))
}

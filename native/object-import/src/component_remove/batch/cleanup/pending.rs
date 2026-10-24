//! Repository.deleteRecordsFromUnmergedComponents writes only when a removed model had a record.
use super::{Change, read_optional};
use crate::component_remove::{Selected, invalid};
use serde_json::Value;
use std::{io, path::Path};
pub(super) fn prepare(root: &Path, selected: &[Selected]) -> io::Result<Option<Change>> {
    let path = crate::scope_path(root).join("unmerged.json");
    let Some(before) = read_optional(&path)? else { return Ok(None) };
    let mut value: Value = serde_json::from_slice(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("unmerged component records"))?;
    let length = rows.len();
    rows.retain(|row| {
        !selected
            .iter()
            .filter(|selected| selected.version.is_some())
            .any(|selected| {
                selected.identity
                    == format!(
                        "{}/{}",
                        row["id"]["scope"].as_str().unwrap_or_default(),
                        row["id"]["name"].as_str().unwrap_or_default(),
                    )
            })
    });
    if rows.len() == length {
        return Ok(None);
    }
    Ok(Some(Change { path, before, after: serde_json::to_vec_pretty(&value)? }))
}

//! Native status classification and metadata receipts for `RemoveMain`.
use super::options::Options;
use bit_object_import::component_remove::{LocalBatch, select_ids};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(in crate::commands) fn ids(root: &Path, pattern: &str) -> io::Result<Vec<String>> {
    select_ids(root, pattern)
        .map(|ids| {
            ids.into_iter()
                .map(|id| bare(&id).to_owned())
                .collect()
        })
}
pub(super) fn prepare(
    root: &Path,
    ids: &[String],
    options: &Options<'_>,
    rows: &[Value],
) -> io::Result<LocalBatch> {
    LocalBatch::prepare(root, ids, options.keep, options.track, &facts(rows))
}
pub(super) fn classify(selected: &[String], rows: &[Value]) -> (Vec<String>, Vec<String>) {
    selected
        .iter()
        .cloned()
        .partition(|id| {
            !rows
                .iter()
                .any(|row| row["identity"] == *id && row["modified"] == true)
        })
}
pub(in crate::commands) fn loadable(
    root: &Path,
    bitmap: &Value,
    ids: &[String],
) -> io::Result<Vec<String>> {
    ids.iter()
        .filter_map(|id| match row(bitmap, id) {
            Ok(row) => main_exists(root, row).then(|| Ok(id.clone())),
            Err(error) => Some(Err(error)),
        })
        .collect()
}
pub(in crate::commands) fn all(bitmap: &Value) -> Vec<String> {
    bitmap
        .as_object()
        .into_iter()
        .flat_map(|rows| rows.iter())
        .filter_map(|(key, row)| {
            if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
                return None;
            }
            let removed = crate::commands::update_cmd::aspect_entry(
                &row["config"],
                "teambit.component/remove",
            )
            .is_some_and(|(_, cfg)| cfg["removed"] == true);
            if row["isAvailableOnCurrentLane"] == false || removed {
                return None;
            }
            row_identity(key, row)
        })
        .collect()
}
pub(in crate::commands) fn row<'a>(bitmap: &'a Value, id: &str) -> io::Result<&'a Value> {
    bitmap
        .as_object()
        .and_then(|rows| {
            rows.iter()
                .find_map(|(key, row)| {
                    (row_identity(key, row).as_deref() == Some(id)).then_some(row)
                })
        })
        .ok_or_else(|| io::Error::other("remove component selection changed"))
}
pub(in crate::commands) fn is_new(bitmap: &Value, id: &str) -> bool {
    bitmap
        .as_object()
        .and_then(|rows| {
            rows.iter()
                .find(|(key, row)| row_identity(key, row).as_deref() == Some(id))
        })
        .is_some_and(|(key, row)| {
            row["version"].as_str().is_none_or(str::is_empty)
                && key.rsplit_once('@').is_none_or(|(_, ver)| ver.is_empty())
        })
}
fn row_identity(key: &str, row: &Value) -> Option<String> {
    let key_id = bare(key);
    let key_scope = key_id.split_once('/').map(|(scope, _)| scope);
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
        .or(key_scope)?;
    let name = row["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(&format!("{scope}/"))
                .unwrap_or(key_id)
        });
    Some(format!("{scope}/{name}"))
}
fn main_exists(root: &Path, row: &Value) -> bool {
    row["rootDir"]
        .as_str()
        .zip(row["mainFile"].as_str())
        .is_some_and(|(directory, main)| {
            root.join(directory)
                .join(main)
                .is_file()
        })
}
pub(in crate::commands) fn bitmap(root: &Path) -> io::Result<Value> {
    bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)
}
pub(in crate::commands) fn facts(rows: &[Value]) -> Vec<Value> {
    rows.iter().map(|row| json!({"identity":row["identity"],"extensions":row["current"]["extensions"],"packageName":row["packageName"]})).collect()
}
fn bare(id: &str) -> &str {
    id.split('@').next().unwrap_or(id)
}

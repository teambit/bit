//! The pre-ignore scan determines `BitMap`'s missing-directory error even for empty directories.
use crate::workspace::engine::inventory;
use serde_json::Value;
use std::{io, path::Path};

/// Whether the canonical pre-ignore component scan finds any files.
pub fn has_scanned_files(root: &Path, directory: &str, bitmap: &Value) -> io::Result<bool> {
    if directory != "." && !super::safe_relative(Path::new(directory)) {
        return Err(super::invalid("component scan directory"));
    }
    let excluded = bitmap
        .as_object()
        .into_iter()
        .flat_map(|rows| rows.values())
        .filter(|row| row["isAvailableOnCurrentLane"] != false)
        .filter(|row| !is_removed_row(row))
        .filter_map(|row| row["rootDir"].as_str())
        .filter(|other| {
            *other != directory && (directory == "." || other.starts_with(&format!("{directory}/")))
        })
        .map(|directory| root.join(directory))
        .chain(std::iter::once(crate::scope_path(root)))
        .collect::<Vec<_>>();
    Ok(!inventory::tracking_scan(&root.join(directory), &excluded, directory == ".")?.is_empty())
}

fn is_removed_row(row: &Value) -> bool {
    row["config"]
        .as_object()
        .and_then(|cfg| {
            cfg.get("teambit.component/remove")
                .or_else(|| {
                    cfg.iter()
                        .find_map(|(key, value)| {
                            key.starts_with("teambit.component/remove@").then_some(value)
                        })
                })
        })
        .is_some_and(|rem| bit_workspace_config::truthy(&rem["removed"]))
}

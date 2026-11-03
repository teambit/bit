//! Pre-ignore directory scan ([`has_scanned_files`], [`is_removed_row`]) determining `BitMap` missing-directory errors even for empty directories.
use crate::workspace::engine::inventory;
use serde_json::Value;
use std::{io, path::Path};

/// Whether the canonical pre-ignore component scan finds any files in `directory` outside [`is_removed_row`] entries.
pub fn has_scanned_files(root: &Path, directory: &str, bitmap: &Value) -> io::Result<bool> {
    let normalized = normalize_dir(directory);
    let directory = normalized.trim_matches('/');
    let directory = if directory.is_empty() { "." } else { directory };
    if directory != "." && !super::safe_relative(Path::new(directory)) {
        return Err(super::invalid("component scan directory"));
    }
    let excluded = bitmap
        .as_object()
        .into_iter()
        .flat_map(|rows| rows.values())
        .filter(|row| row["isAvailableOnCurrentLane"] != false && !is_removed_row(row))
        .filter_map(|row| {
            let norm = normalize_dir(row["rootDir"].as_str()?);
            let other = norm.trim_matches('/');
            (!other.is_empty() && is_nested_root_dir(directory, other)).then(|| root.join(other))
        })
        .chain(std::iter::once(crate::scope_path(root)))
        .collect::<Vec<_>>();
    Ok(!inventory::tracking_scan(&root.join(directory), &excluded, directory == ".")?.is_empty())
}

/// Normalize backslashes in `dir` to forward slashes after trimming whitespace.
#[inline]
fn normalize_dir(dir: &str) -> std::borrow::Cow<'_, str> {
    let trimmed = dir.trim();
    if trimmed.contains('\\') {
        std::borrow::Cow::Owned(trimmed.replace('\\', "/"))
    } else {
        std::borrow::Cow::Borrowed(trimmed)
    }
}

/// Return `true` when `.bitmap` `row` [`Value`] is marked as soft-removed in its `config`.
#[inline]
fn is_removed_row(row: &Value) -> bool {
    crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        || row["config"]
            .as_object()
            .and_then(|cfg| {
                cfg.get("teambit.component/remove")
                    .or_else(|| {
                        cfg.iter()
                            .find_map(|(key, value)| {
                                key.trim()
                                    .starts_with("teambit.component/remove@")
                                    .then_some(value)
                            })
                    })
            })
            .is_some_and(|rem| bit_workspace_config::truthy(&rem["removed"]))
}

/// Return `true` when `candidate` is a strict subdirectory of `directory`.
#[inline]
fn is_nested_root_dir(directory: &str, candidate: &str) -> bool {
    candidate != directory
        && (directory == "."
            || candidate
                .strip_prefix(directory)
                .is_some_and(|rest| rest.starts_with('/')))
}

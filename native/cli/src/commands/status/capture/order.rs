//! Snapshot consumers follow the published loader's breadth-first source traversal.
//!
//! [`snapshot`] and [`snapshot_file_path`] reorder component source file lists in [`Capture`] ([`array`], [`decline`]) to match breadth-first traversal.
use super::{Capture, array, decline, text};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Reorders component source file lists in `capture` ([`Capture`]) via [`snapshot_file_path`] to match the breadth-first traversal order expected by snapshots.
#[inline]
pub(super) fn snapshot(root: &Path, capture: &mut Capture) -> io::Result<()> {
    for target in capture.captured.iter_mut().chain(&mut capture.comparisons) {
        let raw_dir = target["directory"]
            .as_str()
            .or_else(|| target["rootDir"].as_str())
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| decline("snapshot directory"))?;
        let trimmed = raw_dir.trim_start_matches("./").trim_end_matches('/');
        let directory = if trimmed.is_empty() { "." } else { trimmed };
        let files = array(target.get("files"), "snapshot source manifest")?
            .iter()
            .map(snapshot_file_path)
            .collect::<io::Result<Vec<_>>>()?;
        target["files"] = json!(crate::commands::diff::order::captured(
            &root.join(directory),
            &files,
            target.get("sourceOverlays"),
        )?);
    }
    Ok(())
}

/// Extracts and normalizes a non-empty relative file path from a string or object [`Value`] manifest entry via [`text`].
#[inline]
fn snapshot_file_path(file: &Value) -> io::Result<String> {
    let value = if file.is_string() {
        Some(file)
    } else {
        file.get("relativePath")
            .filter(|val| !val.is_null())
            .or_else(|| file.get("path"))
    };
    let path = text(value)?.trim().trim_start_matches("./");
    if path.is_empty() {
        return Err(decline("snapshot file path"));
    }
    Ok(path.to_owned())
}

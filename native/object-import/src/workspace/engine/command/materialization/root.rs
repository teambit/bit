//! [`validate_version`] and [`nested_directories`] guard workspace-root `Version` writes.

#[cfg(test)]
mod tests;

use super::super::super::{client_status::config, invalid};
use serde_json::Value;
use std::{io, path::Path};

const ASPECT: &str = "teambit.workspace/workspace-root";

/// Verifies that a `Version` materialized at `.` carries the [`ASPECT`] (`teambit.workspace/workspace-root`) extension.
#[inline]
pub(super) fn validate_version(version: &Value) -> io::Result<()> {
    let root = version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    config::is_extension_aspect(extension, ASPECT)
                        && extension["data"]["isRoot"] == true
                })
        });
    if !root {
        return Err(invalid("command non-root Version at workspace root"));
    }
    Ok(())
}

/// Collects sorted, deduplicated non-root component directories active in `.bitmap`.
pub(super) fn nested_directories(root: &Path) -> io::Result<Vec<String>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("command root bitmap"))?;
    let mut nested = Vec::with_capacity(rows.len());
    for (key, row) in rows {
        let key = key.trim();
        if key.is_empty()
            || key.starts_with('$')
            || matches!(key, "_bit_lane" | "version")
            || !row.is_object()
            || row["isAvailableOnCurrentLane"] == false
            || config::is_config_removed(&row["config"])
        {
            continue;
        }
        let directory = row["rootDir"]
            .as_str()
            .map(str::trim)
            .filter(|directory| !directory.is_empty())
            .ok_or_else(|| invalid("command nested root directory"))?;
        if directory != "." {
            crate::checkout::plan::relative_path(directory)?;
            nested.push(directory.to_owned());
        }
    }
    nested.sort_unstable();
    nested.dedup();
    Ok(nested)
}

/// Filters `.bitmap` and `nested` component directories out of a workspace-root `Version` `manifest`.
#[inline]
pub(super) fn filter(manifest: &mut Value, nested: &[String]) -> io::Result<()> {
    manifest["proofFiles"] = manifest["files"].clone();
    let files =
        manifest["files"].as_array_mut().ok_or_else(|| invalid("command root manifest files"))?;
    files.retain(|file| {
        let Some(path) = file["relativePath"].as_str().map(str::trim) else { return true };
        let path = path.trim_start_matches("./").trim_end_matches('/');
        path != ".bitmap"
            && !nested
                .iter()
                .any(|directory| {
                    path.strip_prefix(directory.as_str())
                        .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
                })
    });
    Ok(())
}

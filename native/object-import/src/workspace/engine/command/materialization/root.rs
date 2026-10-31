//! A workspace-root Version must not overwrite the live map or a nested component's files.

use super::super::super::{client_status::config, invalid};
use serde_json::Value;
use std::{io, path::Path};

const ASPECT: &str = "teambit.workspace/workspace-root";

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

pub(super) fn nested_directories(root: &Path) -> io::Result<Vec<String>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("command root bitmap"))?;
    let mut nested = Vec::new();
    for (key, row) in rows {
        if matches!(key.as_str(), "$schema-version" | "_bit_lane") {
            continue;
        }
        let directory =
            row["rootDir"].as_str().ok_or_else(|| invalid("command nested root directory"))?;
        if directory != "." {
            crate::checkout::plan::relative_path(directory)?;
            nested.push(directory.to_owned());
        }
    }
    Ok(nested)
}

pub(super) fn filter(manifest: &mut Value, nested: &[String]) -> io::Result<()> {
    manifest["proofFiles"] = manifest["files"].clone();
    let files =
        manifest["files"].as_array_mut().ok_or_else(|| invalid("command root manifest files"))?;
    files.retain(|file| {
        let Some(path) = file["relativePath"].as_str() else { return true };
        path != ".bitmap"
            && !nested
                .iter()
                .any(|directory| path == directory || path.starts_with(&format!("{directory}/")))
    });
    Ok(())
}

#[cfg(test)]
mod tests;

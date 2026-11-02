//! Reuse native [`WorkspaceComponent`] links with the final component-load metadata and canonical IO errors.
//!
//! Provides [`overlay`] to synchronize captured files and main files onto workspace components.
#[cfg(test)]
mod tests;

use bit_install::model::WorkspaceComponent;
use serde_json::Value;
use std::{fs, io, path::Path};

/// Overlays captured file lists, main files, and package names onto `components` via [`apply_captured`].
#[inline]
pub(in crate::commands) fn overlay(
    components: &mut [WorkspaceComponent],
    captured: &[Value],
) -> io::Result<()> {
    for component in components {
        let expected = component.id.to_string_without_version();
        let Some(row) = captured.iter().find(|row| matches_captured(row, &expected)) else {
            continue;
        };
        apply_captured(component, row)?;
    }
    Ok(())
}

/// Applies captured file lists, `mainFile`, extensions, and `packageName` from `row` to `component`.
fn apply_captured(component: &mut WorkspaceComponent, row: &Value) -> io::Result<()> {
    let files: Vec<String> = serde_json::from_value(row["files"].clone())?;
    if files.len() > 4096
        || files
            .iter()
            .any(|file| file.trim().is_empty())
    {
        return Err(io::Error::other("tracking loaded files"));
    }
    component.files = files;
    if let Some(version) = row.get("trackingVersion") {
        component.id.version = version
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .map(str::to_owned);
    }
    if let Some(main) = row["current"]["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|main| !main.is_empty())
    {
        main.clone_into(&mut component.main_file);
    }
    let extensions = row["current"]["extensions"]
        .as_array()
        .ok_or_else(|| io::Error::other("tracking loaded extensions"))?;
    component.config = bit_install::workspace::aspects::from_model(extensions)
        .into_iter()
        .map(|aspect| (aspect.id, aspect.config))
        .collect();
    component.package_name = bit_install::workspace::component_package_name(
        &component.id,
        row["current"]["bindingPrefix"].as_str(),
        &component.config,
    );
    Ok(())
}

/// Returns `true` when `row`'s bare component identity matches `expected`.
#[inline]
fn matches_captured(row: &Value, expected: &str) -> bool {
    let expected = expected.trim();
    !expected.is_empty()
        && row["identity"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .or_else(|| {
                row["id"]
                    .as_str()
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
            })
            .map(|id| id.rsplit_once('@').map_or(id, |(bare, _)| bare.trim()))
            .filter(|id| !id.is_empty())
            == Some(expected)
}

/// Rewrites `ENOTDIR` `mkdir` errors under `root/node_modules` for `components` into canonical Node-style messages.
pub(super) fn error(root: &Path, components: &[WorkspaceComponent], error: io::Error) -> io::Error {
    if !mkdir_not_directory(&error) {
        return error;
    }
    let node_modules = root.join("node_modules");
    let directory = components
        .iter()
        .find_map(|component| {
            let package: std::path::PathBuf =
                Path::new(&component.package_name).components().collect();
            let path = node_modules.join(package);
            let blocker = path
                .ancestors()
                .find(|ancestor| {
                    fs::symlink_metadata(ancestor).is_ok_and(|metadata| metadata.is_file())
                })?;
            Some(if cfg!(windows) { blocker.to_path_buf() } else { path })
        });
    directory.map_or(error, |path| {
        io::Error::other(format!("ENOTDIR: not a directory, mkdir '{}'", path.display()))
    })
}

/// Returns `true` when `error` indicates a non-directory path component during `mkdir` for [`error`].
#[inline]
fn mkdir_not_directory(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::NotADirectory
        || cfg!(windows) && error.raw_os_error() == Some(183)
}

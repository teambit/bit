//! Reuse native links with the final component-load metadata and canonical IO errors.
#[cfg(test)]
mod tests;

use bit_install::model::WorkspaceComponent;
use serde_json::Value;
use std::{fs, io, path::Path};

pub(in crate::commands) fn overlay(
    components: &mut [WorkspaceComponent],
    captured: &[Value],
) -> io::Result<()> {
    for component in components {
        let expected = component.id.to_string_without_version();
        let Some(row) = captured.iter().find(|row| matches_captured(row, &expected)) else {
            continue;
        };
        component.files = serde_json::from_value(row["files"].clone())?;
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
    }
    Ok(())
}

fn matches_captured(row: &Value, expected: &str) -> bool {
    row["identity"]
        .as_str()
        .map(str::trim)
        .map(|id| id.rsplit_once('@').map_or(id, |(bare, _)| bare.trim()))
        == Some(expected)
}

pub(super) fn error(root: &Path, components: &[WorkspaceComponent], error: io::Error) -> io::Error {
    if !mkdir_not_directory(&error) {
        return error;
    }
    let directory = components
        .iter()
        .find_map(|component| {
            let package: std::path::PathBuf =
                Path::new(&component.package_name).components().collect();
            let path = root.join("node_modules").join(package);
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

fn mkdir_not_directory(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::NotADirectory
        || cfg!(windows) && error.raw_os_error() == Some(183)
}

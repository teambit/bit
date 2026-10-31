//! Released CI diagnostics include Node stacks, so predictable errors delegate before providers.
use super::projection::Projection;
use std::{env, fs, io, path::Path};
pub(super) fn ci() -> bool {
    env::var_os("CI").is_some_and(|value| !value.is_empty())
}

pub(super) fn links(root: &Path, projection: &Projection) -> io::Result<()> {
    if !ci() {
        return Ok(());
    }
    for component in &projection.workspace.components {
        let comp_identity = component.id.to_string_without_version();
        if component.root_dir == "."
            || !projection.selected.iter().any(|target| matches_target(target, &comp_identity))
        {
            continue;
        }
        let package = root.join("node_modules").join(&component.package_name);
        if blocked_package(&package)?
            || (!component.has_package_json && blocked_manifest(&package.join("package.json"))?)
        {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "CI link diagnostics require the published stack",
            ));
        }
    }
    Ok(())
}

fn matches_target(target: &serde_json::Value, identity: &str) -> bool {
    let expected = identity.trim();
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .is_some_and(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()) == expected)
}
fn blocked_package(package: &Path) -> io::Result<bool> {
    if metadata(package)?.is_some_and(|metadata| metadata.is_file()) {
        return Ok(true);
    }
    for ancestor in package.ancestors().skip(1) {
        match fs::metadata(ancestor) {
            Ok(metadata) if metadata.is_file() => return Ok(true),
            Ok(_) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(false)
}
fn blocked_manifest(path: &Path) -> io::Result<bool> {
    Ok(metadata(path)?
        .is_some_and(|metadata| metadata.is_dir() || metadata.file_type().is_symlink()))
}
fn metadata(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

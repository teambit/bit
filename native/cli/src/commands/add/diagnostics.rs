//! Released CI diagnostics ([`ci`]) include Node stacks, so predictable [`Projection`] errors delegate before providers.
//!
//! Checks [`links`] preconditions in CI environments via [`blocked_package`] and [`blocked_manifest`] prior to mutating `node_modules`.
use super::projection::Projection;
use std::{env, fs, io, path::Path};
/// Returns `true` when the `CI` environment variable is set and non-empty for [`links`].
#[inline]
pub(super) fn ci() -> bool {
    env::var_os("CI").is_some_and(|value| !value.is_empty())
}

/// Validates via [`ci`] that selected [`Projection`] package paths under `root/node_modules` are not blocked in CI.
pub(super) fn links(root: &Path, projection: &Projection) -> io::Result<()> {
    if !ci() {
        return Ok(());
    }
    let node_modules = root.join("node_modules");
    for component in &projection.workspace.components {
        let package_name = component.package_name.trim();
        if component.root_dir.trim() == "."
            || package_name.is_empty()
            || !projection.selected
                .iter()
                .any(|target| matches_target(target, &component.id.to_string_without_version()))
        {
            continue;
        }
        let package = node_modules.join(package_name);
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

/// Returns `true` when `target` matches the bare component `identity` after stripping `@version` for [`links`].
#[inline]
fn matches_target(target: &serde_json::Value, identity: &str) -> bool {
    let expected = identity.trim();
    !expected.is_empty()
        && target["identity"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .or_else(|| {
                target["id"]
                    .as_str()
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
            })
            .is_some_and(|raw| {
                raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()) == expected
            })
}
/// Returns `true` when `package` or any of its parent directories is blocked by an ordinary file.
fn blocked_package(package: &Path) -> io::Result<bool> {
    if metadata(package)?.is_some_and(|metadata| metadata.is_file()) {
        return Ok(true);
    }
    for ancestor in package.ancestors().skip(1).take(32) {
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
/// Returns `true` when `path` is blocked by an existing directory or symlink instead of a manifest file.
#[inline]
fn blocked_manifest(path: &Path) -> io::Result<bool> {
    Ok(metadata(path)?
        .is_some_and(|metadata| metadata.is_dir() || metadata.file_type().is_symlink()))
}
/// Queries `symlink_metadata` for `path`, mapping `NotFound` and `NotADirectory` to `Ok(None)`.
#[inline]
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

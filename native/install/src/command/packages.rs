//! `bit install <packages>`: argument validation (`install.cmd.tsx`), version
//! resolution with the save prefix (`_addPackages`, `getVersionWithSavePrefix`),
//! and the `workspace.jsonc` policy update (`addToRootPolicy`, `updateConfigPolicy`).
//!
//! [`validate`] resolves component ID arguments to [`extract_package_name`] and updates [`policy_edit`] entries.

pub(super) mod policy_edit;

pub use names::{extract_package_name, is_valid_package_name};

mod names;
#[cfg(test)]
mod tests;

use super::session::{Loaded, Session};
use crate::{engine, manifests::semver};
use std::io;

/// Validate CLI package arguments for `bit install`, resolving component IDs against [`Loaded`] to their package names.
pub fn validate(packages: &[String], loaded: &Loaded) -> io::Result<Vec<String>> {
    packages
        .iter()
        .map(|package| {
            let trimmed = package.trim();
            let name = extract_package_name(trimmed);
            if is_valid_package_name(&name) {
                return Ok(trimmed.to_owned());
            }
            if !name.starts_with('@')
                && let Some(package_name) = component_package_name(trimmed, loaded)
            {
                return Ok(package_name);
            }
            Err(invalid(&format!(
                r#"the package name "{name}" is invalid. please provide a valid package name."#,
            )))
        })
        .collect()
}

/// `workspace.resolveComponentId` + `componentPackageName` for a component id argument.
#[inline]
fn component_package_name(argument: &str, loaded: &Loaded) -> Option<String> {
    let argument = argument.trim();
    let id = argument
        .split_once('@')
        .map_or(argument, |(id, _)| id.trim())
        .trim_matches('/');
    if id.is_empty() {
        return None;
    }
    loaded.workspace.components
        .iter()
        .find(|component| {
            component.id.name == id
                || component.id.scope
                    .as_deref()
                    .and_then(|scope| id.strip_prefix(scope))
                    .and_then(|rest| rest.strip_prefix('/'))
                    == Some(component.id.name.as_str())
                || component.id.to_string_without_version() == id
        })
        .map(|component| component.package_name.trim())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

/// `_addPackages`: resolves each package, adds it to the workspace policy, and persists `workspace.jsonc`.
pub async fn add(
    session: &Session<'_>,
    loaded: &Loaded,
    packages: &[String],
    lifecycle: &str,
) -> io::Result<()> {
    let lifecycle = lifecycle.trim();
    if lifecycle == "dev" {
        return Err(invalid("the workspace policy does not support dev dependencies"));
    }
    let config_prefix = loaded.config.dependency_resolver.save_prefix.as_deref();
    let mut entries = Vec::with_capacity(packages.len());
    for package in packages {
        let resolved = match engine::resolve_remote_version(package, &loaded.engine).await {
            Ok(resolved) => resolved,
            Err(_) if session.options.skip_unavailable => continue,
            Err(error) => return Err(error),
        };
        if resolved.version.trim().is_empty() {
            continue;
        }
        let prefix = session.options.save_prefix.as_deref().or(config_prefix);
        let version =
            version_with_save_prefix(&resolved.version, prefix, resolved.wanted_range.as_deref())?;
        entries.push((resolved.package_name.trim().to_owned(), version));
    }
    policy_edit::add_to_root_policy(session, loaded, &entries, lifecycle)
}

/// Prepends the configured or default `^` save prefix to `version` (`getVersionWithSavePrefix`).
#[inline]
pub fn version_with_save_prefix(
    version: &str,
    prefix: Option<&str>,
    wanted_range: Option<&str>,
) -> io::Result<String> {
    let version = version.trim();
    let wanted_range = wanted_range.map(str::trim);
    let prerelease =
        semver::SemVer::parse(version).is_ok_and(|parsed| !parsed.prerelease.is_empty());
    if prerelease || wanted_range == Some(version) {
        return Ok(version.to_string());
    }
    if let Some(range) = wanted_range.filter(|range| range.starts_with(['~', '^'])) {
        return Ok(range.to_string());
    }
    let with_prefix = format!(
        "{}{version}",
        prefix
            .map(str::trim)
            .filter(|prefix| !prefix.is_empty())
            .unwrap_or("^"),
    );
    if semver::valid_range(&with_prefix).is_none() {
        return Err(invalid(&format!(
            "the version {with_prefix} is invalid. your prefix might be invalid",
        )));
    }
    Ok(with_prefix)
}

/// Constructs an [`io::ErrorKind::InvalidInput`] error with `message`.
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

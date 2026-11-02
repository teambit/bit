//! `dedupeSnapshotDepsToRootManifest`: let pnpm resolve conflicting root-provided versions.
//!
//! Drops snapshot dependency entries when the workspace root provides a different version via [`dedupe`].
//! Preserves peer-satisfied and overridden dependency references during snapshot pruning.
#[cfg(test)]
mod tests;

use super::dep_path;
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

/// Remove snapshot dependency entries whose versions are superseded by the workspace `root` manifest.
pub(super) fn dedupe(
    lockfile: &mut Map<String, Value>,
    root: Option<&Map<String, Value>>,
) -> io::Result<()> {
    let overridden = overridden(lockfile)?;
    let root_deps = root_dependencies(root, &overridden);
    let Some(mut snapshots) = lockfile.get_mut("snapshots").map(Value::take) else {
        return Ok(());
    };
    for (id, snapshot) in snapshots
        .as_object_mut()
        .into_iter()
        .flatten()
    {
        let peers = &lockfile["packages"][dep_path::remove_suffix(id)]["peerDependencies"];
        for field in ["dependencies", "optionalDependencies"] {
            let Some(deps) = snapshot.get_mut(field).and_then(Value::as_object_mut) else {
                continue;
            };
            deps.retain(|name, reference| {
                let trimmed = name.trim();
                !wins(trimmed, reference, root_deps.get(trimmed), !peers[trimmed].is_null())
            });
        }
    }
    lockfile.insert("snapshots".into(), snapshots);
    Ok(())
}

/// Collect non-overridden `dependencies` and `devDependencies` entries from the workspace `root` manifest.
#[inline]
fn root_dependencies(
    root: Option<&Map<String, Value>>,
    overridden: &HashSet<String>,
) -> Map<String, Value> {
    let Some(root) = root else { return Map::new() };
    ["devDependencies", "dependencies"]
        .into_iter()
        .filter_map(|field| root.get(field).and_then(Value::as_object))
        .flatten()
        .filter_map(|(name, value)| {
            let trimmed = name.trim();
            (!trimmed.is_empty() && !overridden.contains(trimmed)).then(|| {
                (trimmed.to_owned(), value.clone())
            })
        })
        .collect()
}

/// Parse the target package names from the `overrides` map of `lockfile`.
#[inline]
fn overridden(lockfile: &Map<String, Value>) -> io::Result<HashSet<String>> {
    lockfile
        .get("overrides")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(selector, _)| selector.trim())
        .filter(|selector| !selector.is_empty())
        .map(|selector| {
            pnpm_config_parse_overrides::parse_pkg_and_parent_selector(selector)
                .map(|(_, target)| target.name.trim().to_owned())
                .map_err(io::Error::other)
        })
        .collect()
}

#[inline]
fn wins(name: &str, reference: &Value, root: Option<&Value>, peer: bool) -> bool {
    let Some((reference, root)) = reference
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .zip(
            root.and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        )
    else {
        return false;
    };
    let root_version = node_semver::Version::parse(root).ok();
    if !peer && root_version.is_none() {
        return false;
    }
    let Some(locked) = dep_path::parse(&format!("{name}@{reference}")).version else {
        return false;
    };
    root_version.is_none_or(|version| locked != version.to_string())
}

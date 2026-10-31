//! `dedupeSnapshotDepsToRootManifest`: let pnpm resolve conflicting root-provided versions.
#[cfg(test)]
mod tests;

use super::dep_path;
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

pub(super) fn dedupe(
    lockfile: &mut Map<String, Value>,
    root: Option<&Map<String, Value>>,
) -> io::Result<()> {
    let overridden = overridden(lockfile)?;
    let mut root_deps = Map::new();
    for field in ["devDependencies", "dependencies"] {
        if let Some(entries) = root.and_then(|root| root.get(field).and_then(Value::as_object)) {
            root_deps.extend(entries.clone());
        }
    }
    root_deps.retain(|name, _| !overridden.contains(name));
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
                !wins(name, reference, root_deps.get(name), peers.get(name).is_some())
            });
        }
    }
    lockfile.insert("snapshots".into(), snapshots);
    Ok(())
}

fn overridden(lockfile: &Map<String, Value>) -> io::Result<HashSet<String>> {
    lockfile
        .get("overrides")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(selector, _)| {
            pnpm_config_parse_overrides::parse_pkg_and_parent_selector(selector.trim())
                .map(|(_, target)| target.name)
                .map_err(io::Error::other)
        })
        .collect()
}

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
    let Some(locked) = dep_path::parse(&format!("{name}@{reference}")).version else {
        return false;
    };
    node_semver::Version::parse(root).map_or(peer, |version| locked != version.to_string())
}

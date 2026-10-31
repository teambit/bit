//! `ApplyOverrides.populateDependencies`, up to the auto-detect overrides:
//! ignored dependencies, dev/runtime de-duplication, model peers, the root
//! `package.json`, the workspace policy and `@teambit/legacy` as a peer.

use super::{Workspace, component_model::ComponentModel, data::Detected};
use crate::{
    model::{Lifecycle, Manifest},
    policy::overrides::{FieldMaps, field_index, ignored},
};
use indexmap::IndexMap;
use serde_json::Value;

const RUNTIME: usize = 0;
const DEV: usize = 1;
const PEER: usize = 2;

/// Steps 2–9: everything that does not depend on the auto-detect overrides.
pub fn early(
    workspace: &Workspace<'_>,
    model: &ComponentModel,
    deps: &FieldMaps,
    detected: &mut Detected,
) -> FieldMaps {
    remove_ignored_components(deps, detected);
    let origin = detected.packages.clone();
    remove_ignored_packages(deps, detected);
    remove_dev_if_regular(detected);
    apply_model_peers(model, deps, detected);
    if let Some(package_json) = workspace.root_package_json {
        apply_package_json(package_json, detected);
    }
    apply_workspace_policy(workspace, detected);
    make_legacy_peer(detected);
    origin
}

fn remove_ignored_components(deps: &FieldMaps, detected: &mut Detected) {
    for lifecycle in [Lifecycle::Runtime, Lifecycle::Dev] {
        let ignore = ignored(deps, lifecycle);
        detected.components[field_index(lifecycle)].retain(|dependency| {
            !dependency.package_name
                .as_ref()
                .is_some_and(|name| ignore.contains(name))
        });
    }
    let runtime = ignored(deps, Lifecycle::Runtime);
    let dev = ignored(deps, Lifecycle::Dev);
    for entry in &mut detected.missing {
        let ignore = if entry.is_dev { &dev } else { &runtime };
        entry.packages.retain(|name| !ignore.contains(name));
    }
    detected.missing.retain(|entry| !entry.packages.is_empty());
}

fn remove_ignored_packages(deps: &FieldMaps, detected: &mut Detected) {
    for lifecycle in [Lifecycle::Runtime, Lifecycle::Dev] {
        let ignore = ignored(deps, lifecycle);
        detected.packages[field_index(lifecycle)].retain(|name, _| !ignore.contains(name));
    }
}

/// `removeDevAndEnvDepsIfTheyAlsoRegulars`.
fn remove_dev_if_regular(detected: &mut Detected) {
    let regular: Vec<String> = detected.packages[RUNTIME]
        .keys()
        .cloned()
        .collect();
    detected.packages[DEV].retain(|name, _| !regular.contains(name));
    let runtime_ids: Vec<_> = detected.components[RUNTIME]
        .iter()
        .map(|dependency| dependency.id.clone())
        .collect();
    detected.components[DEV].retain(|dependency| !runtime_ids.contains(&dependency.id));
}

/// `applyPeersFromComponentModel`: peers recorded in the model that the code uses.
fn apply_model_peers(model: &ComponentModel, deps: &FieldMaps, detected: &mut Detected) {
    let model_peers = model.packages()[PEER].clone();
    if model_peers.is_empty() {
        return;
    }
    let ignore = ignored(deps, Lifecycle::Peer);
    let mut peers = IndexMap::new();
    for (name, version) in &model_peers {
        if ignore.contains(name) {
            continue;
        }
        for field in [RUNTIME, DEV] {
            if detected.packages[field].shift_remove(name).is_some() {
                peers.insert(name.clone(), version.clone());
            }
        }
    }
    detected.packages[PEER] = peers;
}

/// `applyPackageJson`: the workspace `package.json` makes a package a peer or sets its version.
fn apply_package_json(package_json: &Manifest, detected: &mut Detected) {
    let peers = string_map(package_json.get("peerDependencies"));
    let regular = string_map(package_json.get("dependencies"));
    move_by_versions(&peers, &regular, detected);
}

/// `applyWorkspacePolicy`: workspace policy peers become peers, runtime entries set versions.
fn apply_workspace_policy(workspace: &Workspace<'_>, detected: &mut Detected) {
    let [regular, peers] = &workspace.manifest;
    move_by_versions(peers, regular, detected);
    let mut moved = Vec::new();
    for field in [RUNTIME, DEV] {
        for dependency in &mut detected.components[field] {
            let Some(name) = dependency.package_name.clone() else { continue };
            if let Some(version) = peers.get(&name) {
                dependency.version_range = Some(version.clone());
                moved.push(dependency.clone());
            } else if let Some(version) = regular.get(&name) {
                dependency.version_range = Some(version.clone());
            }
        }
        detected.components[field].retain(|dependency| {
            !dependency.package_name
                .as_ref()
                .is_some_and(|name| peers.contains_key(name))
        });
    }
    detected.components[PEER].extend(moved);
}

/// For every detected package: a peer version moves it to the peers, a regular
/// version replaces its version and removes it from the peers.
fn move_by_versions(
    peers: &IndexMap<String, String>,
    regular: &IndexMap<String, String>,
    detected: &mut Detected,
) {
    for field in [RUNTIME, DEV, PEER] {
        let names: Vec<String> = detected.packages[field]
            .keys()
            .cloned()
            .collect();
        for name in names {
            if let Some(version) = peers.get(&name) {
                detected.packages[field].shift_remove(&name);
                detected.packages[PEER].insert(name, version.clone());
            } else if let Some(version) = regular.get(&name) {
                detected.packages[PEER].shift_remove(&name);
                detected.packages[field].insert(name, version.clone());
            }
        }
    }
}

/// `makeLegacyAsPeer`: `@teambit/legacy` is always a `^` peer.
fn make_legacy_peer(detected: &mut Detected) {
    const LEGACY: &str = "@teambit/legacy";
    let runtime = detected.packages[RUNTIME].shift_remove(LEGACY);
    let dev = detected.packages[DEV].shift_remove(LEGACY);
    if let Some(version) = runtime.or(dev) {
        let trimmed = version.trim();
        let peer_range = if trimmed.starts_with(['^', '~', '>', '<', '=', '*']) {
            trimmed.to_owned()
        } else {
            format!("^{trimmed}")
        };
        detected.packages[PEER].insert(LEGACY.to_owned(), peer_range);
    }
}

fn string_map(value: Option<&Value>) -> IndexMap<String, String> {
    value.map(super::data::string_map).unwrap_or_default()
}

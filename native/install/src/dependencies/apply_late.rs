//! `ApplyOverrides.populateDependencies` from the auto-detect overrides on: env
//! peers of an env component, manually added dependencies and the final
//! component/package de-duplication.

use super::{
    Subject, Workspace,
    data::{Detected, LegacyDependency},
    detect::same,
    resolve::{Resolved, ResolvedComponent, Resolver},
};
use crate::policy::overrides::{self, FieldMaps};
use std::io;

const RUNTIME: usize = 0;
const DEV: usize = 1;
const PEER: usize = 2;

/// `applyAutoDetectOverridesOnComponent`: non-forced policy entries apply to
/// dependencies the component actually uses.
pub fn auto_detect(
    auto_detect: &FieldMaps,
    deps: &FieldMaps,
    origin: &FieldMaps,
    detected: &mut Detected,
) {
    let ignored_peers = overrides::ignored(deps, crate::model::Lifecycle::Peer);
    let missing = detected.missing_packages();
    let mut originally = Vec::new();
    for (field, entries) in auto_detect.iter().enumerate() {
        for (name, version) in entries {
            if ignored_peers.contains(name) {
                continue;
            }
            let used = uses_component(detected, name)
                || origin
                    .iter()
                    .any(|packages| packages.contains_key(name))
                || originally.contains(name)
                || missing.contains(name);
            if !used {
                continue;
            }
            originally.push(name.clone());
            apply_one(detected, field, name, version);
        }
    }
}

fn uses_component(detected: &Detected, name: &str) -> bool {
    detected.components
        .iter()
        .flatten()
        .any(|dependency| dependency.package_name.as_deref() == Some(name))
}

fn find(detected: &Detected, field: usize, name: &str) -> Option<LegacyDependency> {
    detected.components[field]
        .iter()
        .find(|dependency| dependency.package_name.as_deref() == Some(name))
        .cloned()
}

fn apply_one(detected: &mut Detected, field: usize, name: &str, version: &str) {
    let in_runtime = find(detected, RUNTIME, name);
    let in_dev = find(detected, DEV, name);
    let has_peer = find(detected, PEER, name).is_some();
    if field == PEER && peer_override(detected, name) {
        return;
    }
    for packages in &mut detected.packages {
        packages.shift_remove(name);
    }
    let used_as_component = in_runtime.is_some() || in_dev.is_some();
    if version == overrides::REMOVE || (used_as_component && field != PEER) {
        return;
    }
    match in_runtime
        .or(in_dev)
        .filter(|_| field == PEER)
    {
        Some(component) => detected.components[PEER].push(LegacyDependency {
            version_range: Some(version.to_owned()),
            ..component
        }),
        None => {
            detected.packages[field].insert(name.to_owned(), version.to_owned());
        }
    }
    if has_peer {
        set_peer_range(detected, name, version);
    }
}

/// `handlePeerDependencyOverride`; `true` when the package is dropped entirely
/// (`@types/*` peers are provided by the env).
fn peer_override(detected: &mut Detected, name: &str) -> bool {
    detected.packages[DEV].shift_remove(name);
    detected.packages[RUNTIME].shift_remove(name);
    if name.starts_with("@types/") {
        detected.packages[PEER].shift_remove(name);
        return true;
    }
    for index in [RUNTIME, DEV] {
        detected.components[index].retain(|dependency| {
            dependency.package_name.as_deref() != Some(name)
        });
    }
    false
}

fn set_peer_range(detected: &mut Detected, name: &str, version: &str) {
    detected.components[PEER]
        .iter_mut()
        .filter(|dependency| dependency.package_name.as_deref() == Some(name))
        .for_each(|dependency| dependency.version_range = Some(version.to_owned()));
}

/// `applyAutoDetectedPeersFromEnvOnEnvItSelf`: an env's own peers are runtime
/// dependencies of the env component. Returns the env-own package names.
pub fn env_own_peers(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
    detected: &mut Detected,
) -> io::Result<Vec<String>> {
    let Some(own) = subject.own_env.as_ref() else { return Ok(Vec::new()) };
    let mut manifest: indexmap::IndexMap<String, String> = indexmap::IndexMap::new();
    for entry in &own.self_policy {
        manifest.insert(entry.name.clone(), entry.version.clone());
    }
    if manifest.is_empty() {
        return Ok(Vec::new());
    }
    for packages in &mut detected.packages {
        packages.retain(|name, _| !manifest.contains_key(name));
    }
    for (name, version) in &manifest {
        let version = if version == overrides::ADD {
            env_peer_version(workspace, subject, resolver, name)?
        } else {
            version.clone()
        };
        detected.packages[RUNTIME].insert(name.clone(), version);
    }
    Ok(manifest.into_keys().collect())
}

/// `resolveEnvPeerDepVersion`: installed, workspace policy, model, else `*`.
fn env_peer_version(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
    name: &str,
) -> io::Result<String> {
    if let Some(version) = resolver
        .find_manifest(&subject.component.dir, name)?
        .and_then(|manifest| manifest["version"].as_str().map(str::to_owned))
    {
        return Ok(version);
    }
    if let Some(version) = workspace.manifest
        .iter()
        .find_map(|field| field.get(name))
    {
        return Ok(version.clone());
    }
    let from_model = subject.model
        .components()
        .into_iter()
        .find(|dependency| dependency.package_name.as_deref() == Some(name))
        .and_then(|dependency| dependency.id.version)
        .or_else(|| subject.model.packages()[RUNTIME].get(name).cloned());
    Ok(from_model.unwrap_or_else(|| "*".to_owned()))
}

/// `manuallyAddDependencies`: forced policy entries.
pub fn manually_add(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
    deps: &FieldMaps,
    detected: &mut Detected,
) -> io::Result<()> {
    let mut peer_components = Vec::new();
    for (field, entries) in deps.iter().enumerate() {
        for (name, value) in entries {
            if value == overrides::REMOVE {
                continue;
            }
            let added = add_one(workspace, subject, resolver, (field, name, value), detected)?;
            if let Some(package) = added.filter(|_| field == PEER) {
                peer_components.push(package);
            }
        }
    }
    detected.components[RUNTIME].retain(|dependency| {
        dependency.package_name
            .as_ref()
            .is_none_or(|name| !peer_components.contains(name))
    });
    Ok(())
}

fn add_one(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
    (field, name, value): (usize, &str, &str),
    detected: &mut Detected,
) -> io::Result<Option<String>> {
    if let Resolved::Component(component) = resolver.resolve(subject.component, ".", name)? {
        return Ok(add_component(subject, field, component, value, detected));
    }
    let Some(version) = manual_version(workspace, name, value) else { return Ok(None) };
    for (_, packages) in detected.packages
        .iter_mut()
        .enumerate()
        .filter(|(index, _)| *index != field)
    {
        packages.shift_remove(name);
    }
    detected.packages[field].insert(name.to_owned(), version);
    Ok(None)
}

/// A manually added component dependency; returns its package name when added.
fn add_component(
    subject: &Subject<'_>,
    field: usize,
    component: ResolvedComponent,
    value: &str,
    detected: &mut Detected,
) -> Option<String> {
    let exists =
        detected.components[field].iter().any(|dependency| same(&dependency.id, &component.id));
    if exists || same(&component.id, &subject.component.id) {
        return None;
    }
    let package = component.package_name;
    for (_, list) in detected.components
        .iter_mut()
        .enumerate()
        .filter(|(index, _)| *index != field)
    {
        list.retain(|dependency| dependency.package_name.as_deref() != Some(package.as_str()));
    }
    detected.components[field].push(LegacyDependency {
        id: component.id,
        package_name: Some(package.clone()),
        version_range: Some(value.to_owned()),
    });
    Some(package)
}

/// `_manuallyAddPackage`: the value, or for `+` the version in the workspace `package.json`.
fn manual_version(workspace: &Workspace<'_>, name: &str, value: &str) -> Option<String> {
    if value != overrides::ADD {
        return Some(value.to_owned());
    }
    let package_json = workspace.root_package_json?;
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .find_map(|field| {
            package_json
                .get(*field)?
                .get(name)?
                .as_str()
                .map(str::to_owned)
        })
}

/// `removeCompDepsFromPackages`.
pub fn remove_components_from_packages(detected: &mut Detected) {
    let names: Vec<String> = detected.components
        .iter()
        .flatten()
        .filter_map(|dependency| dependency.package_name.clone())
        .collect();
    for packages in &mut detected.packages {
        packages.retain(|name, _| !names.contains(name));
    }
}

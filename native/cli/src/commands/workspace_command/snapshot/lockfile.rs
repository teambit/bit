//! `VersionMaker` lockfile roots and package identities exclude scope-only cascade entries.
//!
//! [`hidden_target`] builds [`graph`] lockfile projections over [`Capture`] component targets.
use super::graph;
use crate::commands::status::{
    capture::Capture,
    js::{array, decline, text, without_version},
};
use serde_json::Value;
use std::{io, path::Path};

/// Return `true` when `identity` is a hidden lane-only target excluded from workspace lockfile roots.
#[must_use]
#[inline]
pub(in crate::commands::workspace_command) fn hidden_target(
    context: &Value,
    identity: &str,
) -> bool {
    let identity = without_version(identity.trim());
    let visible = context["targets"]
        .as_array()
        .is_some_and(|targets| {
            targets
                .iter()
                .any(|target| target_identity(target) == Some(identity))
        });
    !visible
        && context["lane"]["targets"]
            .as_array()
            .is_some_and(|targets| {
                targets
                    .iter()
                    .any(|target| {
                        target_identity(target) == Some(identity) && target["hidden"] == true
                    })
            })
}

/// Extracts the unversioned component identity from `target["identity"]` or `target["id"]`.
#[inline]
fn target_identity(target: &Value) -> Option<&str> {
    non_empty_str(&target["identity"])
        .or_else(|| non_empty_str(&target["id"]))
        .map(without_version)
}

#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Lockfile graphs are produced only for workspace components, like `VersionMaker`.
pub(in crate::commands::workspace_command) fn graphs(
    root: &Path,
    context: &Value,
    needs_snap: &[String],
    hashes: &[String],
    capture: &Capture,
) -> io::Result<Vec<Option<String>>> {
    let mut visible = Vec::with_capacity(needs_snap.len());
    let mut versions = Vec::with_capacity(needs_snap.len());
    let mut positions = Vec::with_capacity(needs_snap.len());
    for (index, (identity, hash)) in needs_snap
        .iter()
        .zip(hashes)
        .enumerate()
    {
        if !hidden_target(context, identity) {
            visible.push(identity.clone());
            versions.push(hash.clone());
            positions.push(index);
        }
    }
    let graphs = visible_graphs(root, context, &visible, &versions, capture)?;
    let mut result = vec![None; needs_snap.len()];
    for (index, graph) in positions.into_iter().zip(graphs) {
        result[index] = graph;
    }
    Ok(result)
}

/// The dependency graph of each visible component the snap writes.
fn visible_graphs(
    root: &Path,
    context: &Value,
    needs_snap: &[String],
    hashes: &[String],
    capture: &Capture,
) -> io::Result<Vec<Option<String>>> {
    let targets = array(context.get("targets"), "targets")?;
    let snapped = needs_snap
        .iter()
        .map(|identity| {
            let identity = without_version(identity.trim()).trim();
            let target = targets
                .iter()
                .find(|target| target_identity(target) == Some(identity))
                .ok_or_else(|| decline("command snapshot target"))?;
            let directory = text(target.get("directory"))?.trim();
            let env_id = [&capture.environment_facts, &context["environmentFacts"]]
                .into_iter()
                .find_map(|facts| env_id_str(&facts[identity]["envId"]))
                .unwrap_or("teambit.harmony/node");
            Ok(graph::Snapped { directory, package_name: package_name(capture, identity)?, env_id })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let components = workspace_components(targets, needs_snap, hashes, capture)?;
    graph::graphs(root, &snapped, &components)
}

#[inline]
fn env_id_str(value: &Value) -> Option<&str> {
    non_empty_str(value).or_else(|| non_empty_str(&value["id"]))
}

/// `componentIdByPkgName`: the snapped components under their new hashes,
/// then the others under their workspace versions.
fn workspace_components<'c>(
    targets: &'c [Value],
    needs_snap: &'c [String],
    hashes: &'c [String],
    capture: &'c Capture,
) -> io::Result<Vec<graph::WorkspaceComponent<'c>>> {
    let mut components = needs_snap
        .iter()
        .zip(hashes)
        .map(|(identity, hash)| {
            let identity = without_version(identity.trim()).trim();
            let package_name = package_name(capture, identity)?;
            Ok(graph::WorkspaceComponent { package_name, identity, version: Some(hash) })
        })
        .collect::<io::Result<Vec<_>>>()?;
    for target in targets {
        let identity = target_identity(target).ok_or_else(|| decline("command snapshot target"))?;
        if needs_snap
            .iter()
            .any(|snapped| without_version(snapped.trim()).trim() == identity)
        {
            continue;
        }
        let version = non_empty_str(&target["version"]).or_else(|| non_empty_str(&target["head"]));
        components.push(graph::WorkspaceComponent {
            package_name: package_name(capture, identity)?,
            identity,
            version,
        });
    }
    Ok(components)
}

/// The package name of a captured component.
#[inline]
fn package_name<'c>(capture: &'c Capture, identity: &str) -> io::Result<&'c str> {
    let target = without_version(identity.trim());
    capture.components
        .iter()
        .find(|component| without_version(component.identity.trim()) == target)
        .map(|component| component.package_name.trim())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| decline("command snapshot component"))
}

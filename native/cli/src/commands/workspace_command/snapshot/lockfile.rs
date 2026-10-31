//! `VersionMaker` lockfile roots and package identities exclude scope-only cascade entries.
use super::graph;
use crate::commands::status::{
    capture::Capture,
    js::{array, decline, text, without_version},
};
use serde_json::Value;
use std::{io, path::Path};

/// Scope-only cascade entries are not workspace lockfile roots.
pub(in crate::commands::workspace_command) fn hidden_target(
    context: &Value,
    identity: &str,
) -> bool {
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

fn target_identity(target: &Value) -> Option<&str> {
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(without_version)
}

/// Lockfile graphs are produced only for workspace components, like `VersionMaker`.
pub(in crate::commands::workspace_command) fn graphs(
    root: &Path,
    context: &Value,
    needs_snap: &[String],
    hashes: &[String],
    capture: &Capture,
) -> io::Result<Vec<Option<String>>> {
    let mut visible = Vec::new();
    let mut versions = Vec::new();
    let mut positions = Vec::new();
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
            let target = targets
                .iter()
                .find(|target| target_identity(target) == Some(identity))
                .ok_or_else(|| decline("command snapshot target"))?;
            let directory = text(target.get("directory"))?;
            Ok(graph::Snapped {
                directory,
                package_name: package_name(capture, identity)?,
                env_id: env_id_str(&capture.environment_facts[identity]["envId"])
                    .or_else(|| env_id_str(&context["environmentFacts"][identity]["envId"]))
                    .unwrap_or("teambit.harmony/node"),
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    let components = workspace_components(targets, needs_snap, hashes, capture)?;
    graph::graphs(root, &snapped, &components)
}

fn env_id_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value["id"].as_str())
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
            let package_name = package_name(capture, identity)?;
            Ok(graph::WorkspaceComponent { package_name, identity, version: Some(hash) })
        })
        .collect::<io::Result<Vec<_>>>()?;
    for target in targets {
        let identity = target_identity(target).ok_or_else(|| decline("command snapshot target"))?;
        if needs_snap
            .iter()
            .any(|snapped| snapped == identity)
        {
            continue;
        }
        let version = target
            .get("version")
            .or_else(|| target.get("head"))
            .and_then(Value::as_str)
            .filter(|version| !version.is_empty());
        components.push(graph::WorkspaceComponent {
            package_name: package_name(capture, identity)?,
            identity,
            version,
        });
    }
    Ok(components)
}

/// The package name of a captured component.
fn package_name<'c>(capture: &'c Capture, identity: &str) -> io::Result<&'c str> {
    capture.components
        .iter()
        .find(|component| without_version(&component.identity) == identity)
        .map(|component| component.package_name.as_str())
        .ok_or_else(|| decline("command snapshot component"))
}

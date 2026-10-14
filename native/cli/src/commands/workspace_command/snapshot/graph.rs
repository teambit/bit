//! `calcDependenciesGraph` of `@teambit/pnpm`, as snapping runs it
//! (`_addDependenciesGraphToComponents`): each snapped component's
//! dependency graph, cut from the workspace's `pnpm-lock.yaml`, which the
//! snap stores beside its Version (`dependenciesGraphRef`).
//!
//! The lockfile is read and filtered by pnpm's own `pnpm-lockfile` crate,
//! the code `@pnpm/napi` runs for the Node.js CLI. A graph that refers to
//! a workspace component would need that component's new version: those
//! decline.

mod convert;

use crate::commands::status::js::decline;
use bit_install::config::WorkspaceConfig;
use pnpm_lockfile::{FilterByImportersOptions, IncludedDependencies, Lockfile, PeerEdgeOptions};
use serde_json::{Map, Value};
use std::{collections::HashSet, io, path::Path};

/// `getComponentDirInBitRoots` for the built-in Node environment.
const ROOT_DIR: &str = "node_modules/.bit_roots/teambit.harmony_node";

/// One snapped component.
pub struct Snapped<'s> {
    /// `componentMap.rootDir`.
    pub directory: &'s str,
    pub package_name: &'s str,
}

/// The serialized graph of each snapped component, `None` where the
/// lockfile has no importer for it.
pub fn graphs(
    root: &Path,
    snapped: &[Snapped<'_>],
    workspace_packages: &HashSet<&str>,
) -> io::Result<Vec<Option<String>>> {
    if cfg!(windows) {
        return Err(decline("dependency graph importer paths on Windows"));
    }
    let config = WorkspaceConfig::load(root)?;
    let workspace = config.aspects.get("teambit.workspace/workspace");
    if workspace.is_some_and(|workspace| {
        workspace
            .get("rootComponentsDirectory")
            .is_some_and(|dir| !dir.is_null())
    }) {
        return Err(decline("a custom root components directory"));
    }
    let loaded = Lockfile::load_from_path(&root.join(Lockfile::FILE_NAME))
        .map_err(|error| decline(format!("lockfile: {error}")))?;
    let Some(lockfile) = loaded else { return Ok(vec![None; snapped.len()]) };
    let lockfile = serde_json::to_value(lockfile).map_err(io::Error::other)?;
    if lockfile.get("importers").is_none_or(Value::is_null) {
        return Ok(vec![None; snapped.len()]);
    }
    snapped
        .iter()
        .map(|component| graph(&lockfile, component, workspace_packages))
        .collect()
}

/// One component's graph: its importers, without the other workspace
/// packages, filtered by pnpm and converted.
fn graph(
    lockfile: &Value,
    component: &Snapped<'_>,
    workspace_packages: &HashSet<&str>,
) -> io::Result<Option<String>> {
    let importers = &lockfile["importers"];
    let importer = if component.directory.is_empty() { "." } else { component.directory };
    if importers.get(importer).is_none() {
        return Ok(None);
    }
    let has_root = importers.get(ROOT_DIR).is_some();
    let mut ids = vec![importer.to_string()];
    if has_root && ROOT_DIR != importer {
        ids.push(ROOT_DIR.to_string());
    }
    let narrowed = narrow(lockfile, &ids, importer, component, workspace_packages);
    let partial = filter(narrowed, ids)?;
    let root_dir = has_root.then_some(ROOT_DIR);
    let graph = convert::convert(partial, importer, root_dir, component.package_name)?;
    let text = serde_json::to_string(&graph).map_err(io::Error::other)?;
    if text.contains("@file:") || convert::names_workspace_package(&graph, workspace_packages) {
        return Err(decline("dependency graph with workspace components"));
    }
    Ok(Some(text))
}

/// The lockfile without the other workspace packages in `ids`' importers.
fn narrow(
    lockfile: &Value,
    ids: &[String],
    importer: &str,
    component: &Snapped<'_>,
    workspace_packages: &HashSet<&str>,
) -> Value {
    let mut narrowed = lockfile.clone();
    for id in ids {
        let entry = &mut narrowed["importers"][id.as_str()];
        for name in workspace_packages
            .iter()
            .filter(|name| **name != component.package_name)
        {
            remove_workspace_package(entry, name, id == importer);
        }
    }
    narrowed
}

/// The other workspace packages are wiring, not the component's
/// dependencies, unless the component's own importer injects them.
fn remove_workspace_package(importer: &mut Value, name: &str, own: bool) {
    let lookup = |field: &str| {
        importer
            .get(field)
            .and_then(|deps| deps.get(name))
    };
    let reference = lookup("dependencies")
        .or_else(|| lookup("devDependencies"))
        .or_else(|| lookup("optionalDependencies"));
    let injected = reference
        .and_then(|reference| reference.get("version"))
        .and_then(Value::as_str)
        .is_some_and(|version| version.starts_with("file:"));
    if own && injected {
        return;
    }
    for field in ["dependencies", "devDependencies", "optionalDependencies", "dependenciesMeta"] {
        if let Some(deps) = importer.get_mut(field).and_then(Value::as_object_mut) {
            deps.shift_remove(name);
        }
    }
}

/// `filterLockfileByImporters(lockfile, ids)` with the default options.
fn filter(lockfile: Value, ids: Vec<String>) -> io::Result<Map<String, Value>> {
    let lockfile: Lockfile =
        serde_json::from_value(lockfile).map_err(|error| decline(format!("lockfile: {error}")))?;
    let options = FilterByImportersOptions {
        include: IncludedDependencies {
            dependencies: true,
            dev_dependencies: true,
            optional_dependencies: true,
        },
        skipped: HashSet::new(),
        fail_on_missing_dependencies: false,
        peer_edges: PeerEdgeOptions { resolve_peers_from_workspace_root: false },
    };
    let filtered = lockfile
        .filter_by_importers(ids, &options)
        .map_err(|error| decline(format!("lockfile: {error}")))?;
    match serde_json::to_value(filtered).map_err(io::Error::other)? {
        Value::Object(map) => Ok(map),
        _ => Err(decline("lockfile shape")),
    }
}

#[cfg(test)]
mod graph_tests;

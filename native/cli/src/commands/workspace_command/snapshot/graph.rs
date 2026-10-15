//! `calcDependenciesGraph` of `@teambit/pnpm`, as snapping runs it
//! (`_addDependenciesGraphToComponents`): each snapped component's
//! dependency graph, cut from the workspace's `pnpm-lock.yaml`, which the
//! snap stores beside its Version (`dependenciesGraphRef`).
//!
//! The lockfile is read and filtered by pnpm's own `pnpm-lockfile` crate,
//! the code `@pnpm/napi` runs for the Node.js CLI.

pub use replacer::WorkspaceComponent;

mod convert;
mod replacer;

use replacer::Replacer;

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
    components: &[WorkspaceComponent<'_>],
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
    let workspace = Replacer::new(components)?;
    snapped
        .iter()
        .map(|component| graph(&lockfile, component, &workspace))
        .collect()
}

/// One component's graph: its importers, without the other workspace
/// packages, filtered by pnpm and converted.
fn graph(
    lockfile: &Value,
    component: &Snapped<'_>,
    workspace: &Replacer,
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
    let narrowed = narrow(lockfile, &ids, importer, component, workspace);
    let partial = filter(narrowed, ids)?;
    let root_dir = has_root.then_some(ROOT_DIR);
    let graph = convert::convert(partial, importer, root_dir, component.package_name, workspace)?;
    serde_json::to_string(&graph).map(Some).map_err(io::Error::other)
}

/// The lockfile without the other workspace packages in `ids`' importers.
fn narrow(
    lockfile: &Value,
    ids: &[String],
    importer: &str,
    component: &Snapped<'_>,
    workspace: &Replacer,
) -> Value {
    let mut narrowed = lockfile.clone();
    for id in ids {
        let entry = &mut narrowed["importers"][id.as_str()];
        for name in workspace
            .package_names()
            .filter(|name| *name != component.package_name)
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
    let snapshot_order = snapshot_order(&lockfile, &ids);
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
    let Value::Object(mut map) = serde_json::to_value(filtered).map_err(io::Error::other)? else {
        return Err(decline("lockfile shape"));
    };
    reorder_entries(
        &mut map,
        "packages",
        snapshot_order
            .iter()
            .map(|id| pnpm_deps_path::remove_suffix(id).to_string()),
    );
    reorder_entries(&mut map, "snapshots", snapshot_order.into_iter());
    Ok(map)
}

fn reorder_entries(map: &mut Map<String, Value>, field: &str, order: impl Iterator<Item = String>) {
    let Some(Value::Object(entries)) = map.get_mut(field) else { return };
    let mut ordered = Map::new();
    for id in order {
        if let Some(value) = entries.shift_remove(&id) {
            ordered.insert(id, value);
        }
    }
    ordered.extend(std::mem::take(entries));
    *entries = ordered;
}

/// pnpm's `lockfileWalker` visits importer dependencies in dev, runtime,
/// optional order, marking each sibling before descending into its children.
fn snapshot_order(lockfile: &Value, importers: &[String]) -> Vec<String> {
    let snapshots = &lockfile["snapshots"];
    let mut roots = Vec::new();
    for importer in importers {
        let entry = &lockfile["importers"][importer.as_str()];
        roots.extend(importer_children(entry));
    }
    walk_snapshots(snapshots, roots)
}

fn importer_children(entry: &Value) -> Vec<String> {
    ["devDependencies", "dependencies", "optionalDependencies"]
        .into_iter()
        .flat_map(|field| {
            entry[field]
                .as_object()
                .into_iter()
                .flat_map(|deps| deps.iter())
        })
        .filter_map(|(name, reference)| {
            reference["version"]
                .as_str()
                .and_then(|version| convert::ref_to_relative(version, name))
        })
        .collect()
}

fn walk_snapshots(snapshots: &Value, roots: Vec<String>) -> Vec<String> {
    let mut visited = HashSet::new();
    let mut order = Vec::new();
    let mut pending = vec![snapshot_siblings(snapshots, roots, &mut visited).into_iter()];
    while let Some(siblings) = pending.last_mut() {
        let Some(id) = siblings.next() else {
            pending.pop();
            continue;
        };
        order.push(id.clone());
        let children = snapshot_children(&snapshots[&id]);
        pending.push(snapshot_siblings(snapshots, children, &mut visited).into_iter());
    }
    order
}

fn snapshot_children(snapshot: &Value) -> Vec<String> {
    ["dependencies", "optionalDependencies"]
        .into_iter()
        .flat_map(|field| {
            snapshot[field]
                .as_object()
                .into_iter()
                .flat_map(|deps| deps.iter())
        })
        .filter_map(|(name, reference)| {
            reference.as_str().and_then(|reference| convert::ref_to_relative(reference, name))
        })
        .collect()
}

fn snapshot_siblings(
    snapshots: &Value,
    ids: Vec<String>,
    visited: &mut HashSet<String>,
) -> Vec<String> {
    ids.into_iter()
        .filter(|id| visited.insert(id.clone()) && snapshots.get(id).is_some())
        .collect()
}

#[cfg(test)]
mod graph_tests;

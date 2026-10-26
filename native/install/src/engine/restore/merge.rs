//! Lockfile-document operations of the restore: dropping unreachable entries,
//! scrubbing unpublishable packages and merging into the existing lockfile.

use super::dep_path::remove_suffix;
use serde_json::{Map, Value};
use std::collections::HashSet;

const IMPORTER_DEP_TYPES: [&str; 3] = ["dependencies", "devDependencies", "optionalDependencies"];
const SNAPSHOT_DEP_TYPES: [&str; 2] = ["dependencies", "optionalDependencies"];

fn object_mut<'a>(
    lockfile: &'a mut Map<String, Value>,
    key: &str,
) -> Option<&'a mut Map<String, Value>> {
    lockfile.get_mut(key).and_then(Value::as_object_mut)
}

fn entries(value: Option<&Value>) -> impl Iterator<Item = (&String, &Value)> {
    value
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
}

/// An importer dependency's version: `{ version }`, or a bare string.
fn importer_version(dep: &Value) -> Option<&str> {
    dep.as_str()
        .or_else(|| dep.get("version").and_then(Value::as_str))
}

fn is_local(version: &str) -> bool {
    version.starts_with("link:") || version.starts_with("file:")
}

/// `name@version` of every non-local dependency in `deps`.
fn dep_paths(
    deps: Option<&Value>,
    version_of: fn(&Value) -> Option<&str>,
) -> impl Iterator<Item = String> {
    entries(deps)
        .filter_map(move |(name, dep)| {
            version_of(dep)
                .filter(|version| !is_local(version))
                .map(|version| format!("{name}@{version}"))
        })
}

/// The dep paths the importers depend on directly.
fn importer_roots(lockfile: &Map<String, Value>) -> Vec<String> {
    entries(lockfile.get("importers"))
        .flat_map(|(_, importer)| {
            IMPORTER_DEP_TYPES
                .iter()
                .flat_map(move |dep_type| dep_paths(importer.get(*dep_type), importer_version))
        })
        .collect()
}

/// Every snapshot reachable from the importers. An explicit stack: deep
/// dependency chains would overflow a recursive walk.
fn reachable_snapshots(lockfile: &Map<String, Value>) -> HashSet<String> {
    let mut reachable = HashSet::new();
    let mut stack = importer_roots(lockfile);
    let snapshots = lockfile.get("snapshots");
    while let Some(current) = stack.pop() {
        if !reachable.insert(current.clone()) {
            continue;
        }
        if let Some(snapshot) = snapshots.and_then(|snapshots| snapshots.get(&current)) {
            for dep_type in SNAPSHOT_DEP_TYPES {
                stack.extend(dep_paths(snapshot.get(dep_type), Value::as_str));
            }
        }
    }
    reachable
}

/// Remove `packages` and `snapshots` no importer reaches, and the build
/// entries of removed packages. `strip` maps a dep path to its package id.
pub(super) fn drop_unreachable(lockfile: &mut Map<String, Value>, strip: fn(&str) -> &str) {
    let snapshots = reachable_snapshots(lockfile);
    let packages: HashSet<String> = snapshots
        .iter()
        .map(|path| strip(path).to_string())
        .collect();
    if let Some(entries) = object_mut(lockfile, "packages") {
        entries.retain(|id, _| packages.contains(id));
    }
    if let Some(entries) = object_mut(lockfile, "snapshots") {
        entries.retain(|path, _| snapshots.contains(path));
    }
    if let Some(Value::Array(deps)) = lockfile
        .get_mut("bit")
        .and_then(|bit| bit.get_mut("depsRequiringBuild"))
    {
        deps.retain(|dep| {
            dep.as_str()
                .is_some_and(|dep| packages.contains(strip(dep)))
        });
    }
}

/// Whether `name@version` is an instance of one of `pkg_ids`.
fn refers_to(pkg_ids: &HashSet<String>, name: &str, version: Option<&str>) -> bool {
    version.is_some_and(|version| {
        !is_local(version) && pkg_ids.contains(remove_suffix(&format!("{name}@{version}")))
    })
}

/// Remove `pkg_ids` and every reference to them (`scrubPkgsFromLockfile`).
pub(super) fn scrub(lockfile: &mut Map<String, Value>, pkg_ids: &HashSet<String>) {
    if let Some(packages) = object_mut(lockfile, "packages") {
        packages.retain(|id, _| !pkg_ids.contains(id));
    }
    if let Some(snapshots) = object_mut(lockfile, "snapshots") {
        snapshots.retain(|path, _| !pkg_ids.contains(remove_suffix(path)));
        for snapshot in snapshots.values_mut().filter_map(Value::as_object_mut) {
            scrub_snapshot(snapshot, pkg_ids);
        }
    }
    for importer in
        object_mut(lockfile, "importers").into_iter().flat_map(|importers| importers.values_mut())
    {
        scrub_importer(importer, pkg_ids);
    }
}

/// Drop the importer's references to `pkg_ids`; linked and injected entries stay.
fn scrub_importer(importer: &mut Value, pkg_ids: &HashSet<String>) {
    for dep_type in IMPORTER_DEP_TYPES {
        if let Some(Value::Object(deps)) = importer.get_mut(dep_type) {
            deps.retain(|name, dep| !refers_to(pkg_ids, name, importer_version(dep)));
        }
    }
}

/// Drop the snapshot's references to `pkg_ids`, and dependency groups left empty.
fn scrub_snapshot(snapshot: &mut Map<String, Value>, pkg_ids: &HashSet<String>) {
    for dep_type in SNAPSHOT_DEP_TYPES {
        let Some(Value::Object(deps)) = snapshot.get_mut(dep_type) else { continue };
        deps.retain(|name, reference| !refers_to(pkg_ids, name, reference.as_str()));
        if deps.is_empty() {
            snapshot.remove(dep_type);
        }
    }
}

/// Merge the graph's lockfile into the existing one
/// (`mergeGraphLockfileIntoExisting`): the graph wins per key, but importer
/// entries, packages and snapshots only the existing lockfile knows survive.
pub(super) fn merge_into_existing(
    existing: &Map<String, Value>,
    graph: &Map<String, Value>,
) -> Map<String, Value> {
    let mut merged = existing.clone();
    merged.insert("importers".to_string(), Value::Object(merge_importers(existing, graph)));
    if existing.get("lockfileVersion").is_none_or(Value::is_null)
        && let Some(version) = graph.get("lockfileVersion")
    {
        merged.insert("lockfileVersion".to_string(), version.clone());
    }
    for key in ["packages", "snapshots"] {
        if let Some(entries) = merge_entries(existing.get(key), graph.get(key)) {
            merged.insert(key.to_string(), entries);
        }
    }
    super::context::merge(existing, graph, &mut merged);
    if let Some(bit) = merge_bit(existing.get("bit"), graph.get("bit")) {
        merged.insert("bit".to_string(), bit);
    }
    drop_unreachable(&mut merged, remove_peer_suffix);
    merged
}

fn merge_importers(
    existing: &Map<String, Value>,
    graph: &Map<String, Value>,
) -> Map<String, Value> {
    let mut importers = existing
        .get("importers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for (id, graph_importer) in entries(graph.get("importers")) {
        let Some(Value::Object(existing_importer)) = importers.get(id).cloned() else {
            importers.insert(id.clone(), graph_importer.clone());
            continue;
        };
        let mut merged = existing_importer.clone();
        for dep_type in IMPORTER_DEP_TYPES {
            let mut deps = existing_importer
                .get(dep_type)
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            deps.extend(
                entries(graph_importer.get(dep_type))
                    .map(|(name, dep)| (name.clone(), dep.clone())),
            );
            merged.insert(dep_type.to_string(), Value::Object(deps));
        }
        importers.insert(id.clone(), Value::Object(merged));
    }
    importers
}

/// Per-key deep merge: existing fields the graph does not round-trip survive.
fn merge_entries(existing: Option<&Value>, graph: Option<&Value>) -> Option<Value> {
    let (Some(Value::Object(existing)), Some(Value::Object(graph))) = (existing, graph) else {
        return graph.or(existing).cloned();
    };
    let mut merged = existing.clone();
    for (key, graph_entry) in graph {
        let entry = match (merged.get(key), graph_entry) {
            (Some(Value::Object(existing_entry)), Value::Object(graph_fields)) => {
                let mut fields = existing_entry.clone();
                fields.extend(graph_fields.clone());
                Value::Object(fields)
            }
            _ => graph_entry.clone(),
        };
        merged.insert(key.clone(), entry);
    }
    Some(Value::Object(merged))
}

/// `{ ...existing.bit, ...graph.bit, depsRequiringBuild: sorted union }`.
fn merge_bit(existing: Option<&Value>, graph: Option<&Value>) -> Option<Value> {
    if existing.is_none() && graph.is_none() {
        return None;
    }
    let deps = |bit: Option<&Value>| -> Vec<String> {
        bit.and_then(|bit| bit.get("depsRequiringBuild"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect()
    };
    let mut union: Vec<String> = deps(existing)
        .into_iter()
        .chain(deps(graph))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    union.sort();
    let mut bit = existing
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    bit.extend(
        graph
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
    );
    bit.insert("depsRequiringBuild".to_string(), Value::from(union));
    Some(Value::Object(bit))
}

/// Everything before the first `(` (`removePeerSuffix` in `pnpm.package-manager.ts`).
fn remove_peer_suffix(dep_path: &str) -> &str {
    dep_path
        .find('(')
        .map_or(dep_path, |index| &dep_path[..index])
}

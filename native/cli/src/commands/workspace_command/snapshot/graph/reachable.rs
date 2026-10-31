//! Released 2.2.147 graph filtering copies only reachable packages and snapshots.
#[cfg(test)]
mod tests;

use super::{Snapped, convert, remove_workspace_package, replacer::Replacer};
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

pub(super) fn graph(
    lockfile: &Value,
    component: &Snapped<'_>,
    workspace: &Replacer,
    environment: &str,
) -> io::Result<Option<String>> {
    let directory = component.directory.trim();
    let importer = if directory.is_empty() { "." } else { directory };
    if lockfile["importers"].get(importer).is_none() {
        return Ok(None);
    }
    let root_dir = environment_root(lockfile, environment, component.package_name);
    let importers = selected_importers(lockfile, component, workspace, importer, root_dir);
    let mut partial = filter(lockfile, importers);
    if root_dir.is_none() {
        scrub_own(&mut partial, component.package_name);
    }
    let mut graph =
        convert::convert(partial, importer, root_dir, component.package_name, workspace)?;
    for (source, destination) in [("settings", "lockfileSettings"), ("overrides", "overrides")] {
        if let Some(value) = lockfile
            .get(source)
            .filter(|value| !value.is_null())
        {
            graph[destination] = value.clone();
        }
    }
    serde_json::to_string(&graph).map(Some).map_err(io::Error::other)
}

fn environment_root<'a>(lockfile: &Value, environment: &'a str, package: &str) -> Option<&'a str> {
    let environment = environment.trim();
    let environment = if lockfile["importers"].get(environment).is_none() {
        environment
            .split('@')
            .next()
            .unwrap_or(environment)
            .trim()
    } else {
        environment
    };
    let version =
        lockfile["importers"][environment]["dependencies"][package]["version"].as_str()?.trim();
    lockfile["snapshots"]
        .get(format!("{package}@{version}"))
        .is_some_and(Value::is_object)
        .then_some(environment)
}

fn selected_importers(
    lockfile: &Value,
    component: &Snapped<'_>,
    workspace: &Replacer,
    importer: &str,
    root: Option<&str>,
) -> Map<String, Value> {
    let mut importers = Map::new();
    importers.insert(importer.to_owned(), lockfile["importers"][importer].clone());
    if let Some(root) = root.filter(|root| *root != importer) {
        importers.insert(root.to_owned(), lockfile["importers"][root].clone());
    }
    for (id, entry) in &mut importers {
        for name in workspace
            .package_names()
            .filter(|name| *name != component.package_name)
        {
            remove_workspace_package(entry, name, id == importer);
        }
    }
    importers
}

pub(super) fn filter(lockfile: &Value, importers: Map<String, Value>) -> Map<String, Value> {
    let mut packages = Map::new();
    let mut snapshots = Map::new();
    let mut visited = HashSet::new();
    for importer in importers.values() {
        for root in importer_roots(importer) {
            visit(lockfile, root, &mut visited, &mut packages, &mut snapshots);
        }
    }
    let mut filtered = lockfile
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(key, _)| !matches!(key.as_str(), "importers" | "packages" | "snapshots"))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Map<_, _>>();
    filtered.insert("importers".into(), Value::Object(importers));
    filtered.insert("packages".into(), Value::Object(packages));
    filtered.insert("snapshots".into(), Value::Object(snapshots));
    filtered
}

fn importer_roots(importer: &Value) -> Vec<String> {
    ["dependencies", "devDependencies", "optionalDependencies"]
        .into_iter()
        .flat_map(|field| {
            importer[field]
                .as_object()
                .into_iter()
                .flatten()
        })
        .filter_map(|(name, dependency)| {
            dependency["version"]
                .as_str()
                .and_then(|version| convert::ref_to_relative(version.trim(), name))
        })
        .collect()
}

fn visit(
    lockfile: &Value,
    root: String,
    visited: &mut HashSet<String>,
    packages: &mut Map<String, Value>,
    snapshots: &mut Map<String, Value>,
) {
    let mut stack = vec![root];
    while let Some(id) = stack.pop() {
        if !visited.insert(id.clone()) {
            continue;
        }
        let package = pnpm_deps_path::remove_suffix(&id);
        if let Some(value) = lockfile["packages"].get(package) {
            packages.entry(package.to_owned()).or_insert_with(|| value.clone());
        }
        let Some(snapshot) = lockfile["snapshots"].get(&id) else { continue };
        snapshots.insert(id, snapshot.clone());
        stack.extend(super::snapshot_children(snapshot));
    }
}

fn scrub_own(lockfile: &mut Map<String, Value>, package: &str) {
    let prefix = format!("{package}@file:");
    for field in ["packages", "snapshots"] {
        if let Some(entries) = lockfile.get_mut(field).and_then(Value::as_object_mut) {
            entries.retain(|id, _| !id.starts_with(&prefix));
        }
    }
    let Some(snapshots) = lockfile.get_mut("snapshots").and_then(Value::as_object_mut) else {
        return;
    };
    for snapshot in snapshots.values_mut() {
        scrub_back_edges(snapshot, package);
    }
}

fn scrub_back_edges(snapshot: &mut Value, package: &str) {
    for field in ["dependencies", "optionalDependencies"] {
        let Some(dependencies) = snapshot.get_mut(field).and_then(Value::as_object_mut) else {
            continue;
        };
        if dependencies
            .get(package)
            .and_then(Value::as_str)
            .is_some_and(|version| version.starts_with("file:"))
        {
            dependencies.shift_remove(package);
            if dependencies.is_empty()
                && let Some(snapshot) = snapshot.as_object_mut()
            {
                snapshot.shift_remove(field);
            }
        }
    }
}

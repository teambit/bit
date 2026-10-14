//! `convertLockfileToGraph` (`lockfile-deps-graph-converter.ts`): a
//! component's filtered lockfile as Bit's `DependenciesGraph`, serialized
//! the way `DependenciesGraph.serialize()` writes it. Workspace components
//! never reach here (see the parent module), so no `file:` version is
//! rewritten.

use crate::commands::status::js::decline;
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io};

const SCHEMA_VERSION: &str = "2.0";
const ROOT_EDGE_ID: &str = ".";
/// The lockfile package fields a graph package keeps, in `pick` order.
const PACKAGE_FIELDS: [&str; 12] = [
    "bundledDependencies",
    "cpu",
    "deprecated",
    "engines",
    "hasBin",
    "libc",
    "name",
    "os",
    "peerDependencies",
    "peerDependenciesMeta",
    "resolution",
    "version",
];

/// `convertLockfileToGraph(lockfile, { pkgName, componentRootDir, componentRelativeDir })`.
pub fn convert(
    lockfile: Map<String, Value>,
    importer: &str,
    root_dir: Option<&str>,
    package: &str,
) -> io::Result<Value> {
    let mut lockfile = Value::Object(lockfile);
    let direct = match root_dir {
        None => capsule_dependencies(&lockfile, importer)?,
        Some(root_dir) => root_dependencies(&mut lockfile, importer, root_dir, package)?,
    };
    let mut graph = Map::new();
    graph.insert("schemaVersion".into(), json!(SCHEMA_VERSION));
    graph.insert("packages".into(), Value::Object(packages(&lockfile)?));
    graph.insert("edges".into(), Value::Array(edges(&lockfile, &direct)));
    if let Some(checksum) = lockfile
        .get("pnpmfileChecksum")
        .filter(|value| !value.is_null())
    {
        graph.insert("pnpmfileChecksum".into(), checksum.clone());
    }
    Ok(Value::Object(graph))
}

/// `convertLockfileToGraphFromCapsule`: the importer's own dependencies.
fn capsule_dependencies(lockfile: &Value, importer: &str) -> io::Result<Vec<Value>> {
    let importer = &lockfile["importers"][importer];
    let mut direct = Vec::new();
    for (field, lifecycle, optional) in [
        ("dependencies", "runtime", false),
        ("optionalDependencies", "runtime", true),
        ("devDependencies", "dev", false),
    ] {
        if let Some(deps) = importer
            .get(field)
            .filter(|deps| !deps.is_null())
        {
            direct.extend(importer_neighbours(deps, lifecycle, optional)?);
        }
    }
    Ok(direct)
}

/// The component's dev dependencies from its importer, its runtime ones
/// from its locked package under the environment root, which is then
/// dropped from the graph.
fn root_dependencies(
    lockfile: &mut Value,
    importer: &str,
    root_dir: &str,
    package: &str,
) -> io::Result<Vec<Value>> {
    let own = lockfile["importers"][importer].clone();
    let mut direct = match own
        .get("devDependencies")
        .filter(|deps| !deps.is_null())
    {
        Some(deps) => importer_neighbours(deps, "dev", false)?,
        None => Vec::new(),
    };
    let version = lockfile["importers"][root_dir]["dependencies"][package]["version"]
        .as_str()
        .ok_or_else(|| decline("dependency graph locked component"))?
        .to_string();
    let locked = format!("{package}@{version}");
    let snapshot = lockfile["snapshots"]
        .get(&locked)
        .ok_or_else(|| decline("dependency graph locked component"))?;
    direct.extend(locked_neighbours(snapshot, &own)?);
    if let Some(snapshots) = lockfile.get_mut("snapshots").and_then(Value::as_object_mut) {
        snapshots.shift_remove(&locked);
        for snapshot in snapshots.values_mut() {
            scrub_back_edge(snapshot, package, &version);
        }
    }
    if let Some(packages) = lockfile.get_mut("packages").and_then(Value::as_object_mut) {
        packages.shift_remove(pnpm_deps_path::remove_suffix(&locked));
    }
    Ok(direct)
}

/// The runtime dependencies of the component's locked package, with the
/// specifiers of its importer, `*` when it has none.
fn locked_neighbours(snapshot: &Value, own: &Value) -> io::Result<Vec<Value>> {
    let mut direct = Vec::new();
    for (field, optional) in [("dependencies", false), ("optionalDependencies", true)] {
        let deps = snapshot
            .get(field)
            .and_then(Value::as_object)
            .into_iter()
            .flatten();
        for (name, reference) in deps {
            let Some(id) = ref_to_relative(text(reference)?, name) else { continue };
            let specifier = own[field][name.as_str()]["specifier"].as_str().unwrap_or("*");
            direct.push(json!({ "name": name, "specifier": specifier, "id": id, "lifecycle": "runtime", "optional": optional }));
        }
    }
    Ok(direct)
}

/// Another snapshot's edge back to the component, from a circular
/// workspace dependency, would point at the dropped package.
fn scrub_back_edge(snapshot: &mut Value, package: &str, version: &str) {
    for field in ["dependencies", "optionalDependencies"] {
        let Some(deps) = snapshot.get_mut(field).and_then(Value::as_object_mut) else { continue };
        if deps.get(package).and_then(Value::as_str) != Some(version) {
            continue;
        }
        deps.shift_remove(package);
        if deps.is_empty()
            && let Some(snapshot) = snapshot.as_object_mut()
        {
            snapshot.shift_remove(field);
        }
    }
}

/// `importerDepsToNeighbours`.
fn importer_neighbours(deps: &Value, lifecycle: &str, optional: bool) -> io::Result<Vec<Value>> {
    let mut neighbours = Vec::new();
    for (name, dependency) in
        deps.as_object().ok_or_else(|| decline("lockfile importer dependencies"))?
    {
        let Some(id) = ref_to_relative(text(&dependency["version"])?, name) else { continue };
        let mut neighbour = json!({ "name": name });
        if let Some(specifier) = dependency
            .get("specifier")
            .filter(|specifier| !specifier.is_null())
        {
            neighbour["specifier"] = specifier.clone();
        }
        neighbour["id"] = json!(id);
        neighbour["lifecycle"] = json!(lifecycle);
        neighbour["optional"] = json!(optional);
        neighbours.push(neighbour);
    }
    Ok(neighbours)
}

/// `buildEdges`: each snapshot with dependencies or a suffix, then the root edge.
fn edges(lockfile: &Value, direct: &[Value]) -> Vec<Value> {
    let mut edges = Vec::new();
    for (dep_path, snapshot) in lockfile
        .get("snapshots")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        let neighbours = snapshot_neighbours(snapshot);
        let pkg_id = pnpm_deps_path::remove_suffix(dep_path);
        let mut edge = Map::new();
        edge.insert("id".into(), json!(dep_path));
        edge.insert("neighbours".into(), Value::Array(neighbours.clone()));
        let mut attr = Map::new();
        if pkg_id != dep_path {
            attr.insert("pkgId".into(), json!(pkg_id));
        }
        if let Some(peers) = snapshot
            .get("transitivePeerDependencies")
            .filter(|peers| !peers.is_null())
        {
            attr.insert("transitivePeerDependencies".into(), peers.clone());
        }
        if !attr.is_empty() {
            edge.insert("attr".into(), Value::Object(attr));
        }
        if !neighbours.is_empty() || pkg_id != dep_path {
            edges.push(Value::Object(edge));
        }
    }
    edges.push(json!({ "id": ROOT_EDGE_ID, "neighbours": direct }));
    edges
}

/// `extractDependenciesFromSnapshot`.
fn snapshot_neighbours(snapshot: &Value) -> Vec<Value> {
    let mut neighbours = Vec::new();
    for (field, optional) in [("dependencies", false), ("optionalDependencies", true)] {
        for (name, reference) in snapshot
            .get(field)
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            if let Some(id) =
                reference.as_str().and_then(|reference| ref_to_relative(reference, name))
            {
                neighbours.push(json!({ "id": id, "optional": optional }));
            }
        }
    }
    neighbours
}

/// `buildPackages`: the picked fields; a directory resolution is dropped.
fn packages(lockfile: &Value) -> io::Result<Map<String, Value>> {
    let requiring_build: HashSet<&str> = lockfile
        .get("bit")
        .and_then(|bit| bit.get("depsRequiringBuild"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let mut packages = Map::new();
    for (pkg_id, package) in lockfile
        .get("packages")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        let mut picked = Map::new();
        for field in PACKAGE_FIELDS {
            if let Some(value) = package.get(field) {
                picked.insert(field.into(), value.clone());
            }
        }
        let resolution =
            picked.get("resolution").ok_or_else(|| decline("lockfile package resolution"))?;
        if resolution.get("type").and_then(Value::as_str) == Some("directory") {
            picked.shift_remove("resolution");
        }
        if requiring_build.contains(pkg_id.as_str()) {
            picked.insert("requiresBuild".into(), json!(true));
        }
        packages.insert(pkg_id.clone(), Value::Object(picked));
    }
    Ok(packages)
}

/// Whether a graph package is a workspace component's package, which
/// `buildPackages` would mark with the component id.
pub fn names_workspace_package(graph: &Value, workspace_packages: &HashSet<&str>) -> bool {
    graph["packages"]
        .as_object()
        .is_some_and(|packages| {
            packages
                .keys()
                .any(|pkg_id| {
                    package_name(pkg_id).is_some_and(|name| workspace_packages.contains(name))
                })
        })
}

/// `dp.parse(depPath).name`.
fn package_name(dep_path: &str) -> Option<&str> {
    let separator = dep_path.get(1..)?.find('@')? + 1;
    Some(&dep_path[..separator])
}

/// `refToRelative(reference, pkgName)` of `@pnpm/deps.path`.
pub fn ref_to_relative(reference: &str, name: &str) -> Option<String> {
    if reference.starts_with("link:") {
        return None;
    }
    if reference.starts_with('@') {
        return Some(reference.to_string());
    }
    let Some(at) = reference.find('@') else { return Some(format!("{name}@{reference}")) };
    let before = |marker: char| {
        reference
            .find(marker)
            .is_none_or(|index| at < index)
    };
    if before(':') && before('(') {
        Some(reference.to_string())
    } else {
        Some(format!("{name}@{reference}"))
    }
}

fn text(value: &Value) -> io::Result<&str> {
    value.as_str().ok_or_else(|| decline("lockfile reference"))
}

#[cfg(test)]
mod convert_tests;

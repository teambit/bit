//! `convertLockfileToGraph` (`lockfile-deps-graph-converter.ts`): a
//! component's filtered lockfile as Bit's `DependenciesGraph`, serialized
//! the way `DependenciesGraph.serialize()` writes it, with workspace
//! components named by their versions.

#[cfg(test)]
mod convert_tests;

use super::replacer::Replacer;
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
    replacer: &Replacer,
) -> io::Result<Value> {
    let mut lockfile = Value::Object(lockfile);
    let direct = match root_dir {
        None => capsule_dependencies(&lockfile, importer)?,
        Some(root_dir) => root_dependencies(&mut lockfile, importer, root_dir, package)?,
    };
    let mut graph = Map::new();
    graph.insert("schemaVersion".into(), json!(SCHEMA_VERSION));
    let mut packages = packages(&lockfile, replacer)?;
    let mut edges = edges(&lockfile, direct, replacer);
    drop_orphan_file_packages(&mut packages, &mut edges);
    graph.insert("packages".into(), Value::Object(packages));
    graph.insert("edges".into(), Value::Array(edges));
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
        let Some(deps) = snapshot.get_mut(field).and_then(Value::as_object_mut) else {
            continue;
        };
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
fn edges(lockfile: &Value, mut direct: Vec<Value>, replacer: &Replacer) -> Vec<Value> {
    let snapshots = lockfile
        .get("snapshots")
        .and_then(Value::as_object)
        .into_iter()
        .flatten();
    let mut edges: Vec<Value> =
        snapshots.filter_map(|(dep_path, snapshot)| edge(dep_path, snapshot, replacer)).collect();
    for dependency in &mut direct {
        if let Some(id) = dependency["id"].as_str() {
            dependency["id"] = json!(replacer.replace(id));
        }
    }
    edges.push(json!({ "id": ROOT_EDGE_ID, "neighbours": direct }));
    edges
}

/// One snapshot's edge: `None` without dependencies or a suffix.
fn edge(dep_path: &str, snapshot: &Value, replacer: &Replacer) -> Option<Value> {
    let neighbours = snapshot_neighbours(snapshot, replacer);
    let id = replacer.replace(dep_path);
    let pkg_id = pnpm_deps_path::remove_suffix(&id).to_string();
    if neighbours.is_empty() && pkg_id == id {
        return None;
    }
    let mut attr = Map::new();
    if pkg_id != id {
        attr.insert("pkgId".into(), json!(pkg_id));
    }
    if let Some(peers) = snapshot
        .get("transitivePeerDependencies")
        .filter(|peers| !peers.is_null())
    {
        attr.insert("transitivePeerDependencies".into(), peers.clone());
    }
    let mut edge = json!({ "id": id, "neighbours": neighbours });
    if !attr.is_empty() {
        edge["attr"] = Value::Object(attr);
    }
    Some(edge)
}

/// `extractDependenciesFromSnapshot`.
fn snapshot_neighbours(snapshot: &Value, replacer: &Replacer) -> Vec<Value> {
    let mut neighbours = Vec::new();
    for (field, optional) in [("dependencies", false), ("optionalDependencies", true)] {
        let deps = snapshot
            .get(field)
            .and_then(Value::as_object)
            .into_iter()
            .flatten();
        for (name, reference) in deps {
            if let Some(id) =
                reference.as_str().and_then(|reference| ref_to_relative(reference, name))
            {
                neighbours.push(json!({ "id": replacer.replace(&id), "optional": optional }));
            }
        }
    }
    neighbours
}

/// `buildPackages`: the picked fields; a directory resolution is dropped.
fn packages(lockfile: &Value, replacer: &Replacer) -> io::Result<Map<String, Value>> {
    let requiring_build: HashSet<&str> = lockfile
        .get("bit")
        .and_then(|bit| bit.get("depsRequiringBuild"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let mut packages = Map::new();
    let entries = lockfile
        .get("packages")
        .and_then(Value::as_object)
        .into_iter()
        .flatten();
    for (pkg_id, package) in entries {
        let mut picked = pick(package)?;
        let id = replacer.replace(pkg_id);
        if let Some((name, scope)) = package_name(&id).and_then(|name| replacer.component(name)) {
            picked.insert("component".into(), json!({ "name": name, "scope": scope }));
        }
        if requiring_build.contains(pkg_id.as_str()) {
            picked.insert("requiresBuild".into(), json!(true));
        }
        packages.insert(id, Value::Object(picked));
    }
    Ok(packages)
}

/// `pick(pkg, PACKAGE_FIELDS)`, without a directory resolution.
fn pick(package: &Value) -> io::Result<Map<String, Value>> {
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
    Ok(picked)
}

/// `dropOrphanFilePkgs`: a directory package left with its `file:`
/// version is a workspace package the graph cannot name; it and every edge
/// to it are dropped.
fn drop_orphan_file_packages(packages: &mut Map<String, Value>, edges: &mut Vec<Value>) {
    let mut orphans: Vec<String> = packages
        .keys()
        .filter(|id| is_file_package(id))
        .cloned()
        .collect();
    for edge in edges.iter() {
        let id = edge["id"].as_str().unwrap_or_default();
        let pkg_id = edge["attr"]["pkgId"].as_str().unwrap_or(id);
        if is_file_package(pkg_id) || is_file_package(id) {
            orphans.push(pkg_id.to_string());
            orphans.push(id.to_string());
        }
    }
    if orphans.is_empty() {
        return;
    }
    for id in &orphans {
        packages.shift_remove(id);
    }
    let orphan = |id: &Value| {
        id.as_str()
            .is_some_and(|id| {
                orphans
                    .iter()
                    .any(|orphan| orphan == id)
            })
    };
    edges.retain(|edge| {
        !orphan(&edge["id"])
            && !orphan(
                edge["attr"]
                    .get("pkgId")
                    .unwrap_or_else(|| &edge["id"]),
            )
    });
    for edge in edges.iter_mut() {
        if let Some(neighbours) = edge["neighbours"].as_array_mut() {
            neighbours.retain(|neighbour| !orphan(&neighbour["id"]));
        }
    }
}

/// `dp.parse(pkgId).nonSemverVersion?.startsWith('file:')`.
fn is_file_package(pkg_id: &str) -> bool {
    package_name(pkg_id)
        .is_some_and(|name| {
            pnpm_deps_path::remove_suffix(pkg_id)[name.len() + 1..].starts_with("file:")
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

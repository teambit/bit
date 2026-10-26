//! Bit's serialized `DependenciesGraph` → a `pnpm-lock.yaml` document
//! (`convertGraphToLockfile` in `lockfile-deps-graph-converter.ts`, before the
//! resolution pass).

use super::dep_path::{parse, remove_suffix};
use crate::model::Project;
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    io,
    path::{Component, Path, PathBuf},
};

const ROOT_EDGE_ID: &str = ".";
const SCHEMA_VERSION: &str = "2.0";

/// The graph's package fields a lockfile `packages` entry keeps.
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

/// The parts of a graph the conversion reads.
pub(super) struct Graph {
    pub packages: Map<String, Value>,
    pub edges: Vec<Value>,
    pub resolution_context: Map<String, Value>,
}

impl Graph {
    pub(super) fn parse(serialized: &Value) -> io::Result<Self> {
        if serialized.get("schemaVersion").and_then(Value::as_str) != Some(SCHEMA_VERSION) {
            return Err(io::Error::other("unsupported dependencies graph schema version"));
        }
        let mut graph = Graph {
            packages: serialized
                .get("packages")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            edges: serialized
                .get("edges")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            resolution_context: super::context::graph(serialized),
        };
        graph.drop_orphan_file_packages();
        graph.drop_orphan_neighbours();
        Ok(graph)
    }

    /// Whether the package is a workspace component.
    pub(super) fn is_component(&self, pkg_id: &str) -> bool {
        self.packages
            .get(pkg_id)
            .is_some_and(|pkg| {
                pkg.get("component")
                    .is_some_and(|component| !component.is_null())
            })
    }

    /// Drop `name@file:` packages a graph can carry for workspace components
    /// (`dropOrphanFilePkgs`).
    fn drop_orphan_file_packages(&mut self) {
        let is_file = |id: &str| {
            parse(id).non_semver_version.is_some_and(|version| version.starts_with("file:"))
        };
        let mut orphans: HashSet<String> = self.packages
            .keys()
            .filter(|id| is_file(id))
            .cloned()
            .collect();
        for edge in &self.edges {
            let (id, pkg_id) = (edge_id(edge), edge_pkg_id(edge));
            if is_file(pkg_id) || is_file(id) {
                orphans.extend([pkg_id.to_string(), id.to_string()]);
            }
        }
        if orphans.is_empty() {
            return;
        }
        self.packages.retain(|id, _| !orphans.contains(id));
        self.edges.retain(|edge| {
            !orphans.contains(edge_id(edge)) && !orphans.contains(edge_pkg_id(edge))
        });
        retain_neighbours(&mut self.edges, |neighbour| !orphans.contains(neighbour_id(neighbour)));
    }

    /// Drop neighbours with neither an edge nor a package (`dropOrphanNeighbours`).
    fn drop_orphan_neighbours(&mut self) {
        let edge_ids: HashSet<String> = self.edges
            .iter()
            .map(|edge| edge_id(edge).to_string())
            .collect();
        let packages = &self.packages;
        retain_neighbours(&mut self.edges, |neighbour| {
            let id = neighbour_id(neighbour);
            edge_ids.contains(id) || packages.contains_key(remove_suffix(id))
        });
    }
}

fn retain_neighbours(edges: &mut [Value], keep: impl Fn(&Value) -> bool) {
    for edge in edges {
        if let Some(Value::Array(neighbours)) = edge.get_mut("neighbours") {
            neighbours.retain(&keep);
        }
    }
}

pub(super) fn edge_id(edge: &Value) -> &str {
    edge.get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn edge_pkg_id(edge: &Value) -> &str {
    edge.pointer("/attr/pkgId")
        .and_then(Value::as_str)
        .unwrap_or_else(|| edge_id(edge))
}

fn neighbour_id(neighbour: &Value) -> &str {
    neighbour
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn neighbours(edge: &Value) -> &[Value] {
    edge.get("neighbours")
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// The lockfile document of the graph: `packages`, `snapshots`, the importers
/// of `projects` and the `bit:` block. Resolutions are filled in later.
pub(super) fn to_lockfile(graph: &Graph, projects: &[Project], root: &Path) -> Map<String, Value> {
    let mut entries = Entries::new(graph);
    for edge in graph.edges
        .iter()
        .filter(|edge| edge_id(edge) != ROOT_EDGE_ID)
    {
        entries.add_edge(edge);
    }
    entries.add_remaining_packages();
    let mut lockfile = Map::new();
    lockfile.insert("lockfileVersion".to_string(), json!("9.0"));
    lockfile.extend(graph.resolution_context.clone());
    lockfile.insert("importers".to_string(), Value::Object(importers(graph, projects, root)));
    lockfile.insert("packages".to_string(), Value::Object(entries.packages));
    lockfile.insert("snapshots".to_string(), Value::Object(entries.snapshots));
    lockfile.insert(
        "bit".to_string(),
        json!({ "depsRequiringBuild": deps_requiring_build(graph) }),
    );
    lockfile
}

/// The `packages` and `snapshots` of the lockfile being built.
struct Entries<'graph> {
    graph: &'graph Graph,
    edge_ids: HashSet<&'graph str>,
    packages: Map<String, Value>,
    snapshots: Map<String, Value>,
}

impl<'graph> Entries<'graph> {
    fn new(graph: &'graph Graph) -> Self {
        Entries {
            graph,
            edge_ids: graph.edges
                .iter()
                .map(edge_id)
                .collect(),
            packages: Map::new(),
            snapshots: Map::new(),
        }
    }

    /// The snapshot of an edge and the package it is an instance of.
    fn add_edge(&mut self, edge: &Value) {
        let (optional, regular): (Vec<&Value>, Vec<&Value>) = neighbours(edge)
            .iter()
            .partition(|neighbour| neighbour.get("optional") == Some(&Value::Bool(true)));
        let mut snapshot = Map::new();
        for (key, group) in [("dependencies", regular), ("optionalDependencies", optional)] {
            if !group.is_empty() {
                let deps = group
                    .into_iter()
                    .map(|neighbour| self.dependency_ref(neighbour));
                snapshot.insert(key.to_string(), Value::Object(deps.collect()));
            }
        }
        self.snapshots.insert(edge_id(edge).to_string(), Value::Object(snapshot));
        let pkg_id = edge_pkg_id(edge);
        self.packages.insert(pkg_id.to_string(), Value::Object(self.package(pkg_id)));
    }

    /// `(name, ref)` of a neighbour; a neighbour without an edge of its own
    /// gets an empty snapshot and its package entry.
    fn dependency_ref(&mut self, neighbour: &Value) -> (String, Value) {
        let id = neighbour_id(neighbour);
        let parsed = parse(id);
        if !self.edge_ids.contains(id) {
            self.snapshots.insert(id.to_string(), json!({}));
            self.packages.insert(id.to_string(), Value::Object(self.package(id)));
        }
        let reference = parsed.to_ref();
        (parsed.name.unwrap_or_default(), Value::String(reference))
    }

    /// Packages no edge reaches still get an entry and an empty snapshot.
    fn add_remaining_packages(&mut self) {
        for (pkg_id, package) in &self.graph.packages {
            if !self.packages.contains_key(pkg_id) {
                self.packages.insert(pkg_id.clone(), Value::Object(lockfile_package(package)));
                self.snapshots.insert(pkg_id.clone(), json!({}));
            }
        }
    }

    fn package(&self, pkg_id: &str) -> Map<String, Value> {
        self.graph.packages
            .get(pkg_id)
            .map(lockfile_package)
            .unwrap_or_default()
    }
}

fn lockfile_package(package: &Value) -> Map<String, Value> {
    PACKAGE_FIELDS
        .iter()
        .filter_map(|field| {
            package
                .get(*field)
                .map(|value| ((*field).to_string(), value.clone()))
        })
        .collect()
}

fn deps_requiring_build(graph: &Graph) -> Vec<String> {
    let mut deps: Vec<String> = graph.packages
        .iter()
        .filter(|(_, package)| package.get("requiresBuild") == Some(&Value::Bool(true)))
        .map(|(id, _)| id.clone())
        .collect();
    deps.sort();
    deps
}

/// One importer per project, with the root edge's direct dependencies.
fn importers(graph: &Graph, projects: &[Project], root: &Path) -> Map<String, Value> {
    let Some(root_edge) = graph.edges
        .iter()
        .find(|edge| edge_id(edge) == ROOT_EDGE_ID)
    else {
        return Map::new();
    };
    projects
        .iter()
        .map(|project| {
            (importer_id(root, &project.dir), Value::Object(importer(root_edge, project)))
        })
        .collect()
}

fn importer(root_edge: &Value, project: &Project) -> Map<String, Value> {
    let mut importer = Map::new();
    for dep_type in ["dependencies", "devDependencies", "optionalDependencies"] {
        let mut deps = Map::new();
        for (name, specifier) in project.manifest
            .get(dep_type)
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            let Some(specifier) = specifier.as_str() else { continue };
            let version = match specifier.strip_prefix("link:") {
                Some(target) => {
                    Some(format!("link:{}", posix(&relative(&project.dir, Path::new(target)))))
                }
                None => direct_dependency_ref(root_edge, name, specifier),
            };
            if let Some(version) = version {
                deps.insert(name.clone(), json!({ "version": version, "specifier": specifier }));
            }
        }
        importer.insert(dep_type.to_string(), Value::Object(deps));
    }
    importer
}

fn direct_dependency_ref(root_edge: &Value, name: &str, specifier: &str) -> Option<String> {
    let wanted_id = format!("{name}@{specifier}");
    let found = neighbours(root_edge)
        .iter()
        .find(|dep| {
            dep.get("name").and_then(Value::as_str) == Some(name)
                && (dep.get("specifier").and_then(Value::as_str) == Some(specifier)
                    || remove_suffix(neighbour_id(dep)) == wanted_id)
        })?;
    Some(parse(neighbour_id(found)).to_ref())
}

/// The lockfile importer id of a project: its POSIX path relative to the
/// lockfile root, or `.`.
pub(super) fn importer_id(root: &Path, dir: &Path) -> String {
    let relative = posix(&relative(root, dir));
    if relative.is_empty() { ".".to_string() } else { relative }
}

/// `path.relative(from, to)` for absolute, normalized paths.
pub(super) fn relative(from: &Path, to: &Path) -> PathBuf {
    let from: Vec<Component> = from.components().collect();
    let to: Vec<Component> = to.components().collect();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();
    let mut result = PathBuf::new();
    for _ in common..from.len() {
        result.push("..");
    }
    for component in &to[common..] {
        result.push(component.as_os_str());
    }
    result
}

fn posix(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

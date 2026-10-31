//! `DependenciesGraph.merge` (`scopes/scope/objects/models/dependencies-graph.ts`)
//! on the serialized graph: `{ schemaVersion, packages, edges, pnpmfileChecksum }`.

use super::peers::{
    normalize_peer_provider_versions, split_peer_ids, version_of, without_peer_suffix,
};
use crate::manifests::semver;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// `DependenciesGraph.ROOT_EDGE_ID`.
pub const ROOT: &str = ".";

/// `isEmpty()`.
pub fn is_empty(graph: &Value) -> bool {
    packages(graph).is_empty() && edges(graph).is_empty()
}

/// `merge(incoming)`.
pub fn merge(graph: &mut Value, incoming: &Value) {
    graph["pnpmfileChecksum"] = merged_checksum(graph, incoming);
    merge_root(graph, incoming);
    let incoming_packages = packages(incoming).clone();
    let target = graph["packages"].as_object_mut();
    if let Some(target) = target {
        target.extend(incoming_packages);
    }
    let non_root: Vec<Value> = edges(incoming)
        .iter()
        .filter(|edge| edge["id"] != ROOT)
        .cloned()
        .collect();
    if let Some(target) = graph["edges"].as_array_mut() {
        target.extend(non_root);
    }
    normalize_peer_provider_versions(graph);
    prune_unreachable_from_root(graph);
    if graph["pnpmfileChecksum"].is_null() {
        graph
            .as_object_mut()
            .map(|object| object.remove("pnpmfileChecksum"));
    }
}

fn merge_root(graph: &mut Value, incoming: &Value) {
    let Some(incoming_root) = edges(incoming)
        .iter()
        .find(|edge| edge["id"] == ROOT)
        .cloned()
    else {
        return;
    };
    let Some(root) = root_mut(graph) else {
        if let Some(target) = graph["edges"].as_array_mut() {
            target.push(incoming_root);
        }
        return;
    };
    let empty = Vec::new();
    for direct in incoming_root["neighbours"].as_array().unwrap_or(&empty) {
        merge_direct(root, direct);
    }
}

fn merge_direct(root: &mut Value, direct: &Value) {
    let Some(neighbours) = root["neighbours"].as_array_mut() else { return };
    let Some(existing) = neighbours.iter_mut().find(|existing| same_direct(existing, direct))
    else {
        neighbours.push(direct.clone());
        return;
    };
    if is_wildcard(&existing["specifier"]) && !is_wildcard(&direct["specifier"]) {
        existing["specifier"] = direct["specifier"].clone();
    }
    let (left, right) = (id(existing).to_owned(), id(direct).to_owned());
    if left != right && node_id_less_than(&left, &right) {
        existing["id"] = Value::String(right);
    }
}

/// `isSameDirectDependency`.
fn same_direct(left: &Value, right: &Value) -> bool {
    match (left["name"].as_str(), right["name"].as_str()) {
        (Some(left_name), Some(right_name)) if !left_name.is_empty() && !right_name.is_empty() => {
            left_name == right_name
                && (left["specifier"] == right["specifier"]
                    || is_wildcard(&left["specifier"])
                    || is_wildcard(&right["specifier"]))
        }
        _ => id(left) == id(right),
    }
}

/// `isWildcardSpecifier`.
fn is_wildcard(specifier: &Value) -> bool {
    specifier.is_null() || specifier == "*" || specifier == ""
}

/// `nodeIdLessThan`.
fn node_id_less_than(left: &str, right: &str) -> bool {
    match (version_of(left), version_of(right)) {
        (Some(left), Some(right)) => semver::gt(&right, &left).unwrap_or(false),
        _ => false,
    }
}

/// `mergePnpmfileChecksums`.
fn merged_checksum(graph: &Value, incoming: &Value) -> Value {
    if !has_resolutions(incoming) {
        return graph["pnpmfileChecksum"].clone();
    }
    if !has_resolutions(graph) {
        return incoming["pnpmfileChecksum"].clone();
    }
    if graph["pnpmfileChecksum"] == incoming["pnpmfileChecksum"] {
        graph["pnpmfileChecksum"].clone()
    } else {
        Value::Null
    }
}

/// `hasResolutions()`.
fn has_resolutions(graph: &Value) -> bool {
    !packages(graph).is_empty()
        || edges(graph)
            .iter()
            .any(|edge| {
                edge["id"] != ROOT
                    || edge["neighbours"]
                        .as_array()
                        .is_some_and(|neighbours| !neighbours.is_empty())
            })
}

/// `pruneUnreachableFromRoot`: an explicit stack visiting every node once.
fn prune_unreachable_from_root(graph: &mut Value) {
    let Some(root) = edges(graph)
        .iter()
        .find(|edge| edge["id"] == ROOT)
        .cloned()
    else {
        return;
    };
    let by_id: HashMap<String, Value> = edges(graph)
        .iter()
        .filter(|edge| edge["id"] != ROOT)
        .map(|edge| (id(edge).to_owned(), edge.clone()))
        .collect();
    let (reachable_edges, reachable_packages) = reachable(&root, &by_id);
    let mut kept = vec![root];
    kept.extend(
        edges(graph)
            .iter()
            .filter(|edge| edge["id"] != ROOT && reachable_edges.contains(id(edge)))
            .cloned(),
    );
    graph["edges"] = Value::Array(dedupe_by_id(kept));
    if let Some(packages) = graph["packages"].as_object_mut() {
        packages.retain(|package, _| reachable_packages.contains(package));
    }
}

fn reachable(root: &Value, by_id: &HashMap<String, Value>) -> (HashSet<String>, HashSet<String>) {
    let (mut edges, mut packages, mut visited) = (HashSet::new(), HashSet::new(), HashSet::new());
    let mut stack: Vec<String> = neighbour_ids(root);
    while let Some(node) = stack.pop() {
        if !visited.insert(node.clone()) {
            continue;
        }
        packages.insert(without_peer_suffix(&node).to_owned());
        stack.extend(
            split_peer_ids(&node)
                .into_iter()
                .filter(|peer| !peer.starts_with("patch_hash=")),
        );
        let Some(edge) = by_id.get(&node) else { continue };
        edges.insert(node.clone());
        if let Some(package) = edge["attr"]["pkgId"]
            .as_str()
            .or_else(|| edge["pkgId"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            packages.insert(package.to_owned());
        }
        stack.extend(neighbour_ids(edge));
    }
    (edges, packages)
}

/// A JavaScript `Map` by id: first position, last value.
fn dedupe_by_id(edges: Vec<Value>) -> Vec<Value> {
    let mut by_id: indexmap::IndexMap<String, Value> = indexmap::IndexMap::new();
    for edge in edges {
        by_id.insert(id(&edge).to_owned(), edge);
    }
    by_id.into_values().collect()
}

fn neighbour_ids(edge: &Value) -> Vec<String> {
    edge["neighbours"]
        .as_array()
        .map(|neighbours| {
            neighbours
                .iter()
                .map(|neighbour| id(neighbour).to_owned())
                .collect()
        })
        .unwrap_or_default()
}

fn root_mut(graph: &mut Value) -> Option<&mut Value> {
    graph["edges"]
        .as_array_mut()?
        .iter_mut()
        .find(|edge| edge["id"] == ROOT)
}

pub fn id(value: &Value) -> &str {
    value
        .as_str()
        .or_else(|| value["id"].as_str())
        .or_else(|| value["nodeId"].as_str())
        .map_or("", str::trim)
}

pub fn packages(graph: &Value) -> &Map<String, Value> {
    static EMPTY: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    graph["packages"]
        .as_object()
        .unwrap_or_else(|| EMPTY.get_or_init(Map::new))
}

pub fn edges(graph: &Value) -> &[Value] {
    graph["edges"]
        .as_array()
        .map_or(&[], Vec::as_slice)
}

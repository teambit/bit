//! Transitive dependent auto-tag candidate discovery ([`plan`], [`graph`], [`walk`], [`Node`], `snapshotAutoTag`).

use super::invalid;
use serde_json::{Value, json};
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    io,
};

/// Component dependency-graph node with its ID, locator, and outgoing dependency keys.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Node {
    id: Value,
    locator: Value,
    edges: Vec<String>,
}
/// Computes auto-tag candidate indices and triggering dependency edges from `input` via [`graph`] and [`walk`].
pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let components = array(input, "components")?;
    let changed = array(input, "changed")?;
    if components.len() > 4096 || changed.len() > 4096 {
        return Err(invalid("autotag component budget"));
    }
    let mut changed_map = HashMap::with_capacity(changed.len());
    for id in changed {
        changed_map
            .entry(identity(id)?)
            .or_insert(id);
    }
    let graph = graph(components)?;
    let mut results = Vec::new();
    for (index, component) in components.iter().enumerate() {
        let key = identity(&component["id"])?;
        if changed_map.contains_key(&key) {
            continue;
        }
        let triggered = triggers(&key, &graph, &changed_map, &input["semver"])?;
        if !triggered.is_empty() {
            results.push(json!({"component":index,"triggeredBy":triggered}));
        }
    }
    Ok(json!({"results":results}))
}
/// Builds the reverse dependency adjacency map across `components` for auto-tag traversal into [`Node`] entries.
fn graph(components: &[Value]) -> io::Result<HashMap<String, Node>> {
    let ids: Vec<String> = components
        .iter()
        .map(|component| identity(&component["id"]))
        .collect::<io::Result<_>>()?;
    let known: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut graph = HashMap::with_capacity(components.len());
    let mut count = 0;
    for (index, (component, from)) in components.iter().zip(&ids).enumerate() {
        for (dependency, entry) in array(component, "dependencies")?.iter().enumerate() {
            edge(&mut graph, &known, &mut count, from, (index, component), (dependency, entry))?;
        }
    }
    Ok(graph)
}
/// Performs a depth-first traversal of reverse dependency `graph` starting from `key`.
fn walk(
    key: &str,
    graph: &HashMap<String, Node>,
    visited: &mut HashSet<String>,
    output: &mut Vec<String>,
) -> io::Result<()> {
    let mut stack = vec![key.to_owned()];
    while let Some(key) = stack.pop() {
        let Some(node) = graph.get(&key) else {
            continue;
        };
        if !visited.insert(key.clone()) {
            continue;
        }
        output.push(key);
        let mut edges: Vec<_> = node.edges.iter().collect();
        edges.sort_by_key(|name| numeric_key(name).map_or((1, 0), |number| (0, number)));
        stack.extend(edges.into_iter().rev().cloned());
        if stack.len() > 65536 {
            return Err(invalid("autotag traversal budget"));
        }
    }
    Ok(())
}
/// Returns `true` when `changed` has a version greater than or equal to `dependency` according to `semver`.
fn qualifies(changed: &Value, dependency: &Value, semver: &Value) -> io::Result<bool> {
    let left = version_str(changed);
    let right = version_str(dependency);
    if let (Some(left), Some(right)) = (left, right)
        && let (Some(left), Some(right)) =
            (semver[left].get("version"), semver[right].get("version"))
    {
        return Ok(crate::config_merge::compare_versions(left, right)? != Ordering::Less);
    }
    Ok(true)
}
/// Extracts the non-empty version string from component `id` (`id["version"]` or `@version` suffix).
fn version_str(id: &Value) -> Option<&str> {
    id["version"]
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .or_else(|| {
            id.as_str()
                .and_then(|raw| raw.rsplit_once('@').map(|(_, ver)| ver.trim()))
                .filter(|ver| !ver.is_empty())
        })
}
pub(super) fn identity(id: &Value) -> io::Result<String> {
    if let Some(raw) = id.as_str() {
        let raw = raw.trim();
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        if bare.is_empty()
            || bare.starts_with('/')
            || bare.ends_with('/')
            || bare.contains(['\\', '\0'])
            || bare.contains("..")
        {
            return Err(invalid("autotag identity"));
        }
        return Ok(bare.to_owned());
    }
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .map(|name| name.rsplit_once('@').map_or(name, |(prefix, _)| prefix.trim()))
        .filter(|value| !value.is_empty() && !value.starts_with('/') && !value.ends_with('/'))
        .filter(|value| !value.contains(['\\', '\0']) && !value.contains(".."))
        .ok_or_else(|| invalid("autotag identity"))?;
    match id.get("scope") {
        None | Some(Value::Null) => Ok(name.to_owned()),
        Some(Value::String(scope)) if scope.trim().is_empty() => Ok(name.to_owned()),
        Some(Value::String(scope))
            if !scope.contains(['/', '\\', '\0']) && !scope.contains("..") =>
        {
            Ok(format!("{}/{name}", scope.trim()))
        }
        _ => Err(invalid("autotag scope")),
    }
}
fn array<'a>(value: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    value[field]
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("autotag array"))
}

fn numeric_key(name: &str) -> Option<u32> {
    let number = name
        .parse::<u32>()
        .ok()
        .filter(|number| *number != u32::MAX)?;
    (number.to_string() == name).then_some(number)
}

fn triggers(
    key: &str,
    graph: &HashMap<String, Node>,
    changed: &HashMap<String, &Value>,
    semver: &Value,
) -> io::Result<Vec<Value>> {
    let mut visited = HashSet::new();
    let mut order = Vec::new();
    walk(key, graph, &mut visited, &mut order)?;
    let mut triggered = Vec::new();
    for name in order {
        let node = &graph[&name];
        if let Some(&id) = changed.get(&name)
            && qualifies(id, &node.id, semver)?
        {
            triggered.push(node.locator.clone());
        }
    }
    Ok(triggered)
}

fn insert(graph: &mut HashMap<String, Node>, key: &str, id: &Value, locator: Value) {
    graph
        .entry(key.to_owned())
        .or_insert_with(|| Node { id: id.clone(), locator, edges: Vec::new() });
}

fn edge(
    graph: &mut HashMap<String, Node>,
    known: &HashSet<&str>,
    count: &mut usize,
    from: &str,
    component: (usize, &Value),
    dependency: (usize, &Value),
) -> io::Result<()> {
    let to = identity(dependency.1)?;
    if !known.contains(to.as_str()) {
        return Ok(());
    }
    *count += 1;
    if *count > 65536 {
        return Err(invalid("autotag edge budget"));
    }
    insert(graph, from, &component.1["id"], json!({"kind":"component","component":component.0}));
    insert(
        graph,
        &to,
        dependency.1,
        json!({"kind":"dependency","component":component.0,"index":dependency.0}),
    );
    let node = graph.get_mut(from).unwrap();
    if !node.edges.contains(&to) {
        node.edges.push(to);
    }
    Ok(())
}

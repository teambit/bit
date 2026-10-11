use super::invalid;
use serde_json::{Value, json};
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    io,
};

struct Node {
    id: Value,
    locator: Value,
    edges: Vec<String>,
}
pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let components = array(input, "components")?;
    let changed = array(input, "changed")?;
    if components.len() > 4096 || changed.len() > 4096 {
        return Err(invalid("autotag component budget"));
    }
    for id in changed {
        identity(id)?;
    }
    let graph = graph(components)?;
    let mut results = Vec::new();
    for (index, component) in components.iter().enumerate() {
        let key = identity(&component["id"])?;
        if changed
            .iter()
            .any(|id| identity(id).ok().as_ref() == Some(&key))
        {
            continue;
        }
        let triggered = triggers(&key, &graph, changed, &input["semver"])?;
        if !triggered.is_empty() {
            results.push(json!({"component":index,"triggeredBy":triggered}));
        }
    }
    Ok(json!({"results":results}))
}
fn graph(components: &[Value]) -> io::Result<HashMap<String, Node>> {
    let known: HashSet<_> = components
        .iter()
        .map(|component| identity(&component["id"]))
        .collect::<io::Result<_>>()?;
    let mut graph = HashMap::new();
    let mut count = 0;
    for (index, component) in components.iter().enumerate() {
        let from = identity(&component["id"])?;
        for (dependency, entry) in array(component, "dependencies")?.iter().enumerate() {
            edge(&mut graph, &known, &mut count, &from, (index, component), (dependency, entry))?;
        }
    }
    Ok(graph)
}
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
fn qualifies(changed: &Value, dependency: &Value, semver: &Value) -> io::Result<bool> {
    let left = changed["version"].as_str();
    let right = dependency["version"].as_str();
    if let (Some(left), Some(right)) = (left, right)
        && let (Some(left), Some(right)) =
            (semver[left].get("version"), semver[right].get("version"))
    {
        return Ok(crate::config_merge::compare_versions(left, right)? != Ordering::Less);
    }
    Ok(true)
}
pub(super) fn identity(id: &Value) -> io::Result<String> {
    let name = id["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("autotag identity"))?;
    match id.get("scope") {
        None | Some(Value::Null) => Ok(name.to_owned()),
        Some(Value::String(scope)) if scope.is_empty() => Ok(name.to_owned()),
        Some(Value::String(scope)) => Ok(format!("{scope}/{name}")),
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
    changed: &[Value],
    semver: &Value,
) -> io::Result<Vec<Value>> {
    let mut visited = HashSet::new();
    let mut order = Vec::new();
    walk(key, graph, &mut visited, &mut order)?;
    let mut triggered = Vec::new();
    for name in order {
        let node = &graph[&name];
        if let Some(id) = changed
            .iter()
            .find(|id| identity(id).ok().as_ref() == Some(&name))
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
    known: &HashSet<String>,
    count: &mut usize,
    from: &str,
    component: (usize, &Value),
    dependency: (usize, &Value),
) -> io::Result<()> {
    let to = identity(dependency.1)?;
    if !known.contains(&to) {
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

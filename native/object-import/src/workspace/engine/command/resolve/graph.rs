mod saved;

use super::super::{invalid, repository::Repository, resolve_snapshot::Material};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn project(materials: &mut [Material], repository: &mut Repository) -> io::Result<()> {
    project_with_saved(materials, repository, true)
}

pub(super) fn rebuild(materials: &mut [Material], repository: &mut Repository) -> io::Result<()> {
    project_with_saved(materials, repository, false)
}

fn project_with_saved(
    materials: &mut [Material],
    repository: &mut Repository,
    reuse: bool,
) -> io::Result<()> {
    let saved = if reuse { saved::capture(materials, repository)? } else { HashMap::new() };
    let versions: HashMap<_, _> = materials
        .iter()
        .map(|material| (material.identity.clone(), material.version.clone()))
        .collect();
    for material in materials {
        let (flattened, graph) =
            traverse(&material.identity, &material.version, &versions, &saved, repository)?;
        material.version["flattenedDependencies"] = json!(flattened);
        material.version["flattenedEdges"] = json!(graph);
        material.version
            .as_object_mut()
            .ok_or_else(|| invalid("resolve Version"))?
            .remove("flattenedEdgesRef");
        mark_dependencies(&mut material.version, &versions)?;
    }
    Ok(())
}

pub(super) fn previous_graph(
    materials: &[Material],
    repository: &mut Repository,
) -> io::Result<HashMap<String, Vec<Value>>> {
    saved::capture(materials, repository)
}

fn traverse(
    identity: &str,
    version: &Value,
    versions: &HashMap<String, Value>,
    saved: &saved::Graph,
    repository: &mut Repository,
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    let root = pending(identity)?;
    let mut stack = edges(&root, version)?;
    stack.reverse();
    let mut seen = HashSet::from([key(&root)?]);
    let mut flattened = Vec::new();
    let mut graph = Vec::new();
    while let Some(mut edge) = stack.pop() {
        if graph.len() >= 16384 || seen.len() >= 4096 {
            return Err(invalid("resolve graph budget"));
        }
        let identity = project_target(&mut edge, versions)?;
        let target = edge["target"].clone();
        retain_edge(&mut graph, edge);
        if !seen.insert(key(&target)?) {
            continue;
        }
        flattened.push(target.clone());
        let projected = is_pending(&target)
            .then(|| versions.get(&identity))
            .flatten();
        stack.extend(children(&target, projected, saved, repository)?);
    }
    Ok((flattened, graph))
}

fn project_target(edge: &mut Value, versions: &HashMap<String, Value>) -> io::Result<String> {
    let identity = super::selection::identity(&edge["target"])?;
    if versions.contains_key(&identity) {
        if !is_pending(&edge["source"]) {
            return Err(invalid("resolve retained graph reaches prior batch version"));
        }
        edge["target"] = pending(&identity)?;
    }
    Ok(identity)
}

fn retain_edge(graph: &mut Vec<Value>, edge: Value) {
    if !graph
        .iter()
        .any(|old| old["source"] == edge["source"] && old["target"] == edge["target"])
    {
        graph.push(edge);
    }
}

fn children(
    target: &Value,
    projected: Option<&Value>,
    saved: &saved::Graph,
    repository: &mut Repository,
) -> io::Result<Vec<Value>> {
    if projected.is_none()
        && let Some(edges) = saved.get(&key(target)?)
    {
        let mut edges = edges.clone();
        edges.reverse();
        return Ok(edges);
    }
    let version = match projected {
        Some(value) => value.clone(),
        None => load(repository, target)?,
    };
    let mut children = edges(target, &version)?;
    children.reverse();
    Ok(children)
}

fn mark_dependencies(version: &mut Value, versions: &HashMap<String, Value>) -> io::Result<()> {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        for dependency in version[field]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            mark_dependency(dependency, versions)?;
        }
    }
    Ok(())
}

fn mark_dependency(dependency: &mut Value, versions: &HashMap<String, Value>) -> io::Result<()> {
    let identity = super::selection::identity(&dependency["id"])?;
    if versions.contains_key(&identity) {
        dependency["id"]["version"] = pending(&identity)?["version"].clone();
    }
    Ok(())
}

fn pending(identity: &str) -> io::Result<Value> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("resolve graph identity"))?;
    Ok(json!({"scope":scope,"name":name,"version":format!("__bit_pending_snapshot__:{identity}")}))
}
fn is_pending(id: &Value) -> bool {
    id["version"]
        .as_str()
        .is_some_and(|version| version.starts_with("__bit_pending_snapshot__:"))
}

pub(super) fn key(id: &Value) -> io::Result<String> {
    Ok(format!(
        "{}@{}",
        super::selection::identity(id)?,
        id["version"].as_str().ok_or_else(|| invalid("resolve graph version"))?,
    ))
}
pub(super) fn edges(source: &Value, version: &Value) -> io::Result<Vec<Value>> {
    let mut edges = Vec::new();
    for (field, kind) in [("dependencies", "prod"), ("devDependencies", "dev")] {
        for dependency in
            version[field].as_array().ok_or_else(|| invalid("resolve graph dependencies"))?
        {
            add_edge(&mut edges, source, &dependency["id"], kind)?;
        }
    }
    for extension in version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if let Some(id) = extension.get("extensionId") {
            add_edge(&mut edges, source, id, "ext")?;
        }
    }
    Ok(edges)
}

fn add_edge(edges: &mut Vec<Value>, source: &Value, target: &Value, kind: &str) -> io::Result<()> {
    key(target)?;
    let edge = json!({"source":source,"target":target,"type":kind});
    if let Some(previous) = edges
        .iter_mut()
        .find(|row| row["target"] == *target)
    {
        *previous = edge;
    } else {
        edges.push(edge);
    }
    Ok(())
}

fn load(repository: &mut Repository, id: &Value) -> io::Result<Value> {
    let version = id["version"].as_str().ok_or_else(|| invalid("resolve dependency version"))?;
    let reference = if crate::merge_history::hash(version).is_ok() {
        version.to_owned()
    } else {
        let identity = super::selection::identity(id)?;
        let model =
            repository.read(&crate::workspace::engine::hash(identity.as_bytes()), "Component")?;
        crate::workspace::engine::status_models::versions::reference(&model, version)?
    };
    let value = repository.read(&reference, "Version")?;
    super::super::policy::graph::validate_saved(&value, repository)?;
    crate::workspace::engine::status_models::harmony::project(&value)
}

#[cfg(test)]
mod tests;

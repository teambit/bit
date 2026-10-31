//! Stash dependency IDs are the pre-allocation IDs, never pending snap markers.
use super::{Component, Repository, invalid};
use crate::workspace::engine::status_models::{harmony, versions};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn project(
    components: &mut [Component],
    repository: &mut Repository,
    context: &Value,
) -> io::Result<Option<String>> {
    let identities = identities(context)?;
    for row in &mut *components {
        raw_dependency_ids(&mut row.version, &identities)?;
    }
    let inputs: HashMap<_, _> = components
        .iter()
        .map(|row| (key(&id(row)), row.version.clone()))
        .collect();
    let saved = saved(components, repository)?;
    for row in components {
        let root = id(row);
        let (flattened, graph) =
            traverse(&root, &row.version, &inputs, &saved, repository, &identities)?;
        if let Some(message) = unversioned(row, &flattened, context)? {
            return Ok(Some(message));
        }
        row.version["flattenedDependencies"] = json!(flattened);
        row.version["flattenedEdges"] = json!(graph);
        row.version
            .as_object_mut()
            .ok_or_else(|| invalid("stash Version"))?
            .remove("flattenedEdgesRef");
    }
    Ok(None)
}
fn identities(context: &Value) -> io::Result<HashMap<String, Value>> {
    let mut identities = HashMap::new();
    for target in context["targets"].as_array().ok_or_else(|| invalid("stash graph targets"))? {
        let identity = target["identity"].as_str().ok_or_else(|| invalid("stash graph target"))?;
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("stash graph target ID"))?;
        let id = component_id(
            scope,
            name,
            target["version"].as_str().unwrap_or_default(),
            target["scoped"] == true,
        );
        identities.insert(key(&id), id);
    }
    Ok(identities)
}
fn saved(
    components: &[Component],
    repository: &mut Repository,
) -> io::Result<HashMap<String, Vec<Value>>> {
    let mut saved = HashMap::new();
    for row in components {
        let Some(previous) = &row.previous else {
            continue;
        };
        append(&mut saved, &previous_graph(previous, repository)?)?;
    }
    Ok(saved)
}

fn previous_graph(previous: &str, repository: &mut Repository) -> io::Result<Value> {
    let version = repository.read(previous, "Version")?;
    match version["flattenedEdgesRef"].as_str() {
        Some(hash) => repository.source_json(hash),
        None => Ok(version
            .get("flattenedEdges")
            .cloned()
            .unwrap_or_else(|| json!([]))),
    }
}

fn id(row: &Component) -> Value {
    row.id.clone()
}

fn key(id: &Value) -> String {
    format!(
        "{}/{}@{}",
        id["scope"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default(),
        id["name"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default(),
        id["version"]
            .as_str()
            .map(str::trim)
            .unwrap_or_default(),
    )
}
fn edges(source: &Value, version: &Value) -> io::Result<Vec<Value>> {
    let mut rows = Vec::new();
    for (field, kind) in [("dependencies", "prod"), ("devDependencies", "dev")] {
        for dependency in array_or_empty(version, field, "stash dependency list")? {
            insert(
                &mut rows,
                json!({"source":canonical_id(source),"target":canonical_id(&dependency["id"]),"type":kind}),
            );
        }
    }
    for extension in array_or_empty(version, "extensions", "stash extensions")? {
        if let Some(id) = extension.get("extensionId") {
            insert(
                &mut rows,
                json!({"source":canonical_id(source),"target":canonical_id(id),"type":"ext"}),
            );
        }
    }
    Ok(rows)
}

fn array_or_empty<'a>(
    version: &'a Value,
    field: &str,
    message: &'static str,
) -> io::Result<&'a [Value]> {
    match version.get(field) {
        None | Some(Value::Null) => Ok(&[][..]),
        Some(value) => value
            .as_array()
            .map(Vec::as_slice)
            .ok_or_else(|| invalid(message)),
    }
}
fn insert(rows: &mut Vec<Value>, edge: Value) {
    if let Some(old) = rows
        .iter_mut()
        .find(|old| old["source"] == edge["source"] && old["target"] == edge["target"])
    {
        *old = edge;
    } else {
        rows.push(edge);
    }
}
fn append(saved: &mut HashMap<String, Vec<Value>>, graph: &Value) -> io::Result<()> {
    for edge in graph.as_array().ok_or_else(|| invalid("stash saved graph"))? {
        saved
            .entry(key(&edge["target"]))
            .or_default();
        insert(
            saved
                .entry(key(&edge["source"]))
                .or_default(),
            edge.clone(),
        );
        if saved.len() > 4096 {
            return Err(invalid("stash graph node budget"));
        }
    }
    Ok(())
}
fn traverse(
    root: &Value,
    version: &Value,
    inputs: &HashMap<String, Value>,
    saved: &HashMap<String, Vec<Value>>,
    repository: &mut Repository,
    identities: &HashMap<String, Value>,
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    let mut stack = edges(root, version)?;
    stack.reverse();
    let mut seen = HashSet::from([key(root)]);
    let mut flattened = Vec::new();
    let mut graph = Vec::new();
    while let Some(edge) = stack.pop() {
        let target = edge["target"].clone();
        insert(&mut graph, edge);
        if !seen.insert(key(&target)) {
            continue;
        }
        flattened.push(ordered_id(&target, identities));
        let mut children = if let Some(version) = inputs.get(&key(&target)) {
            edges(&target, version)?
        } else if let Some(rows) = saved.get(&key(&target)) {
            rows.clone()
        } else {
            edges(&target, &load(&target, repository)?)?
        };
        children.reverse();
        stack.extend(children);
        if seen.len() > 4096 || graph.len() > 16384 {
            return Err(invalid("stash graph budget"));
        }
    }
    Ok((flattened, graph))
}
fn load(id: &Value, repository: &mut Repository) -> io::Result<Value> {
    repository.prepare_versions(&[crate::command_import::Target {
        scope: id["scope"].as_str().map(str::to_owned),
        name: id["name"]
            .as_str()
            .ok_or_else(|| invalid("stash dependency name"))?
            .to_owned(),
        version: id["version"]
            .as_str()
            .ok_or_else(|| invalid("stash dependency version"))?
            .to_owned(),
    }])?;
    let version = id["version"].as_str().ok_or_else(|| invalid("stash external version absent"))?;
    let reference = if crate::merge_history::hash(version).is_ok() {
        version.to_owned()
    } else {
        let identity = format!(
            "{}/{}",
            id["scope"].as_str().unwrap_or_default(),
            id["name"].as_str().unwrap_or_default(),
        );
        let model = repository.read_component(&identity)?;
        versions::reference(&model, version)?
    };
    harmony::project(&repository.read(&reference, "Version")?)
}

#[cfg(test)]
mod tests;

fn ordered_id(id: &Value, identities: &HashMap<String, Value>) -> Value {
    identities
        .get(&key(id))
        .unwrap_or(id)
        .clone()
}
pub(super) fn component_id(scope: &str, name: &str, version: &str, scoped: bool) -> Value {
    let mut fields = serde_json::Map::new();
    if scoped {
        fields.insert("scope".into(), json!(scope));
    }
    fields.insert("name".into(), json!(name));
    if !version.is_empty() {
        fields.insert("version".into(), json!(version));
    }
    if !scoped {
        fields.insert("scope".into(), json!(scope));
    }
    Value::Object(fields)
}

fn canonical_id(id: &Value) -> Value {
    let mut fields = serde_json::Map::new();
    for field in ["scope", "name", "version"] {
        if let Some(value) = id.get(field) {
            fields.insert(field.into(), value.clone());
        }
    }
    Value::Object(fields)
}
fn raw_dependency_ids(version: &mut Value, identities: &HashMap<String, Value>) -> io::Result<()> {
    for field in ["dependencies", "devDependencies"] {
        for dependency in array_mut_or_empty(version, field, "stash dependencies")? {
            dependency["id"] = ordered_id(&dependency["id"], identities);
        }
    }
    for extension in array_mut_or_empty(version, "extensions", "stash extensions")? {
        if let Some(id) = extension.get("extensionId").cloned() {
            extension["extensionId"] = ordered_id(&id, identities);
        }
    }
    Ok(())
}

fn array_mut_or_empty<'a>(
    version: &'a mut Value,
    field: &str,
    message: &'static str,
) -> io::Result<&'a mut [Value]> {
    match version.get_mut(field) {
        None | Some(Value::Null) => Ok(&mut [][..]),
        Some(value) => value
            .as_array_mut()
            .map(Vec::as_mut_slice)
            .ok_or_else(|| invalid(message)),
    }
}

fn unversioned(
    component: &Component,
    flattened: &[Value],
    context: &Value,
) -> io::Result<Option<String>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("stash graph targets"))?;
    for id in flattened {
        if id["version"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
        {
            continue;
        }
        let dependency = display_id(id);
        if targets
            .iter()
            .any(|row| row["identity"] == dependency && row["scoped"] == false)
        {
            return Ok(Some(format!(
                "fatal: \"{}\" has a dependency \"{dependency}\".\nthis dependency was not included in the tag command.",
                display_id(&component.id),
            )));
        }
    }
    Ok(None)
}
fn display_id(id: &Value) -> String {
    let mut value = format!(
        "{}/{}",
        id["scope"].as_str().unwrap_or_default(),
        id["name"].as_str().unwrap_or_default(),
    );
    if let Some(version) = id["version"]
        .as_str()
        .filter(|value| !value.is_empty())
    {
        value.push('@');
        value.push_str(version);
    }
    value
}

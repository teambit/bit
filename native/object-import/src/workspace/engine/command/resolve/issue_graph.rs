use super::{graph, projection::Component, selection};
use crate::workspace::engine::command::{
    invalid, repository::Repository, resolve_snapshot::Material,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
};

pub(super) fn capture(
    components: &[Component],
    current: &[Value],
    materials: &[Material],
    repository: &mut Repository,
) -> io::Result<Value> {
    let workspace = current
        .iter()
        .map(|row| {
            let identity =
                row["identity"].as_str().ok_or_else(|| invalid("issue workspace identity"))?;
            let version =
                row["version"].as_str().ok_or_else(|| invalid("issue workspace version"))?;
            Ok(if version.is_empty() {
                identity.to_owned()
            } else {
                format!("{identity}@{version}")
            })
        })
        .collect::<io::Result<HashSet<_>>>()?;
    let seeds = dependencies(components)?;
    if seeds
        .iter()
        .all(|id| workspace.contains(id))
    {
        return Ok(json!({"external":[]}));
    }
    let saved = graph::previous_graph(materials, repository)?;
    external(seeds, &workspace, &saved, repository)
}

fn dependencies(components: &[Component]) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    for component in components {
        component_dependencies(&component.dependency_state, &mut output)?;
    }
    Ok(output)
}

fn component_dependencies(state: &Value, output: &mut Vec<String>) -> io::Result<()> {
    for indices in
        state["components"].as_array().ok_or_else(|| invalid("issue component indices"))?
    {
        for index in indices.as_array().ok_or_else(|| invalid("issue lifecycle indices"))? {
            let index = index.as_u64().ok_or_else(|| invalid("issue dependency index"))? as usize;
            let id = state["entries"]
                .get(index)
                .and_then(|row| row["identity"].as_str())
                .ok_or_else(|| invalid("issue dependency identity"))?;
            output.push(id.to_owned());
        }
    }
    Ok(())
}

fn external(
    seeds: Vec<String>,
    workspace: &HashSet<String>,
    graph: &HashMap<String, Vec<Value>>,
    repository: &mut Repository,
) -> io::Result<Value> {
    let mut queue = VecDeque::from(seeds);
    let mut seen = workspace.clone();
    let mut output = Vec::new();
    while let Some(identity) = queue.pop_front() {
        if !seen.insert(identity.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("issue graph budget"));
        }
        let edges = graph
            .get(&identity)
            .ok_or_else(|| invalid("issue graph unproven external adjacency"))?;
        absent_model(&identity, repository)?;
        let dependencies = edges
            .iter()
            .map(|edge| graph::key(&edge["target"]))
            .collect::<io::Result<Vec<_>>>()?;
        queue.extend(dependencies.iter().cloned());
        output.push(json!({"identity":identity,"dependencies":dependencies,"model":null}));
    }
    Ok(json!({"external":output}))
}

fn absent_model(identity: &str, repository: &mut Repository) -> io::Result<()> {
    let (name, version) =
        identity.rsplit_once('@').ok_or_else(|| invalid("issue external version"))?;
    if version.is_empty() {
        return Err(invalid("issue external version"));
    }
    let (scope, component) =
        name.split_once('/').ok_or_else(|| invalid("issue external identity"))?;
    selection::identity(&json!({"scope":scope,"name":component}))?;
    match repository.read(&crate::workspace::engine::hash(name.as_bytes()), "Component") {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
        Ok(_) => Err(invalid("issue external model requires canonical callbacks")),
    }
}

#[cfg(test)]
mod tests;

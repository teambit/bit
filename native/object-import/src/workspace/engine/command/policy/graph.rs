mod previous;
use super::{
    super::{invalid, repository::Repository},
    projection,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(super) fn project(row: &mut super::Row, repository: &mut Repository) -> io::Result<()> {
    let root = pending_root(&row.identity)?;
    let mut stack = direct(&root, &row.projected)?;
    stack.reverse();
    let mut seen = HashSet::from([key(&root)?]);
    let mut flattened = Vec::new();
    let mut edges = Vec::new();
    while let Some(edge) = stack.pop() {
        if edges.len() >= 16384 || seen.len() > 4096 {
            return Err(invalid("command dependency graph budget"));
        }
        let target = edge["target"].clone();
        let identity = key(&target)?;
        if !edges
            .iter()
            .any(|existing: &Value| {
                existing["source"] == edge["source"] && existing["target"] == target
            })
        {
            edges.push(edge);
        }
        if !seen.insert(identity) {
            continue;
        }
        flattened.push(target.clone());
        let version = load(repository, &target)?;
        previous::validate(&version, repository)?;
        let mut children = direct(&target, &version)?;
        children.reverse();
        stack.extend(children);
    }
    row.projected["flattenedDependencies"] = json!(flattened);
    row.projected["flattenedEdges"] = json!(edges);
    row.projected
        .as_object_mut()
        .ok_or_else(|| invalid("command graph Version"))?
        .remove("flattenedEdgesRef");
    Ok(())
}

fn direct(source: &Value, version: &Value) -> io::Result<Vec<Value>> {
    let mut edges = Vec::<Value>::new();
    for (field, kind) in [("dependencies", "prod"), ("devDependencies", "dev")] {
        for dependency in projection::array(&version[field])? {
            key(&dependency["id"])?;
            let edge = json!({"source":source,"target":dependency["id"],"type":kind});
            if let Some(previous) = edges
                .iter_mut()
                .find(|previous| previous["target"] == dependency["id"])
            {
                *previous = edge;
            } else {
                edges.push(edge);
            }
        }
    }
    extension_edges(source, version, &mut edges)?;
    Ok(edges)
}

fn extension_edges(source: &Value, version: &Value, edges: &mut Vec<Value>) -> io::Result<()> {
    for extension in projection::array(&version["extensions"])? {
        if let Some(id) = extension.get("extensionId") {
            key(id)?;
            let edge = json!({"source":source,"target":id,"type":"ext"});
            if let Some(existing) = edges
                .iter_mut()
                .find(|edge| edge["target"] == *id)
            {
                *existing = edge;
            } else {
                edges.push(edge);
            }
        }
    }
    Ok(())
}

fn load(repository: &mut Repository, id: &Value) -> io::Result<Value> {
    let version = id["version"].as_str().ok_or_else(|| invalid("command graph version"))?;
    let identity = format!(
        "{}/{}",
        id["scope"].as_str().ok_or_else(|| invalid("command graph scope"))?,
        id["name"].as_str().ok_or_else(|| invalid("command graph name"))?,
    );
    let reference = if crate::merge_history::hash(version).is_ok() {
        version.to_owned()
    } else {
        let model = repository.read_component(&identity)?;
        crate::workspace::engine::status_models::versions::reference(&model, version)
            .map_err(|_| invalid("command graph missing dependency reference"))?
    };
    let version = repository.read(&reference, "Version")?;
    crate::workspace::engine::status_models::harmony::project(&version)
}

fn key(id: &Value) -> io::Result<String> {
    let scope = id["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("command graph scope"))?;
    let name = id["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("command graph name"))?;
    let version = id["version"]
        .as_str()
        .filter(|version| !version.is_empty())
        .ok_or_else(|| invalid("command graph version"))?;
    Ok(format!("{scope}/{name}@{version}"))
}

#[cfg(test)]
mod tests;

pub(super) fn validate_previous(
    rows: &[super::Row],
    repository: &mut Repository,
) -> io::Result<()> {
    for row in rows {
        previous::validate(&row.baseline.versions[1], repository)?;
    }
    Ok(())
}

fn pending_root(identity: &str) -> io::Result<Value> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("command graph identity"))?;
    Ok(
        json!({"scope":scope,"name":name,"version":super::super::merge::snapshot::PENDING_GRAPH_VERSION}),
    )
}

pub(in crate::workspace::engine::command) fn validate_saved(
    version: &Value,
    repository: &mut Repository,
) -> io::Result<()> {
    previous::validate(version, repository)
}

use super::{Material, Repository, invalid, key};
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) type Graph = HashMap<String, Vec<Value>>;

pub(super) fn capture(materials: &[Material], repository: &mut Repository) -> io::Result<Graph> {
    let mut graph = Graph::new();
    for material in materials
        .iter()
        .filter(|material| !material.version_state.current_head.is_empty())
    {
        let version = repository.read(&material.version_state.current_head, "Version")?;
        let edges = match version["flattenedEdgesRef"].as_str() {
            Some(reference) => repository.source_json(reference)?,
            None => version
                .get("flattenedEdges")
                .cloned()
                .unwrap_or_else(|| serde_json::json!([])),
        };
        append(&mut graph, &edges)?;
    }
    Ok(graph)
}

pub(super) fn append(graph: &mut Graph, edges: &Value) -> io::Result<()> {
    let edges = edges.as_array().ok_or_else(|| invalid("resolve saved graph edges"))?;
    if edges.len() > 16384 {
        return Err(invalid("resolve saved graph edge budget"));
    }
    for edge in edges {
        let source = key(&edge["source"])?;
        let target = key(&edge["target"])?;
        if !matches!(edge["type"].as_str(), Some("prod" | "dev" | "ext")) {
            return Err(invalid("resolve saved graph lifecycle"));
        }
        graph.entry(target).or_default();
        let outgoing = graph.entry(source).or_default();
        if let Some(previous) = outgoing
            .iter_mut()
            .find(|row| row["target"] == edge["target"])
        {
            *previous = edge.clone();
        } else {
            outgoing.push(edge.clone());
        }
        if graph.len() > 4096 {
            return Err(invalid("resolve saved graph node budget"));
        }
    }
    if graph
        .values()
        .map(Vec::len)
        .fold(0_usize, usize::saturating_add)
        > 16384
    {
        return Err(invalid("resolve saved graph total edge budget"));
    }
    Ok(())
}

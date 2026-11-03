//! Saved `flattenedEdges` and `flattenedEdgesRef` [`Graph`] [`capture`] from prior `Version` objects.

use super::{Material, Repository, invalid, key};
use serde_json::Value;
use std::{collections::HashMap, io};

/// Adjacency map of saved flattened dependency edges keyed by source component identity.
pub(super) type Graph = HashMap<String, Vec<Value>>;

/// Captures saved flattened dependency edges from the current head `Version` of each entry in `materials` ([`Material`]) via [`append`].
#[inline]
pub(super) fn capture(materials: &[Material], repository: &mut Repository) -> io::Result<Graph> {
    let mut graph = Graph::new();
    for material in materials
        .iter()
        .filter(|material| !material.version_state.current_head.is_empty())
    {
        let version = repository.read(&material.version_state.current_head, "Version")?;
        let edges = if let Some(value) = version
            .get("flattenedEdgesRef")
            .filter(|value| !value.is_null())
        {
            let reference = value
                .as_str()
                .map(str::trim)
                .filter(|reference| !reference.is_empty())
                .ok_or_else(|| invalid("resolve saved graph reference"))?;
            repository.source_json(reference)?
        } else {
            version
                .get("flattenedEdges")
                .cloned()
                .unwrap_or_else(|| serde_json::json!([]))
        };
        append(&mut graph, &edges)?;
    }
    Ok(graph)
}

/// Validates and appends `edges` into `graph` via [`insert_edge`] within node and edge budget limits.
pub(super) fn append(graph: &mut Graph, edges: &Value) -> io::Result<()> {
    let edges = edges.as_array().ok_or_else(|| invalid("resolve saved graph edges"))?;
    if edges.is_empty() {
        return Ok(());
    }
    if edges.len() > 16384 {
        return Err(invalid("resolve saved graph edge budget"));
    }
    for edge in edges {
        insert_edge(graph, edge)?;
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

/// Validates and inserts a single flattened dependency `edge` into `graph` ([`Graph`]) via [`key`] within the node budget.
fn insert_edge(graph: &mut Graph, edge: &Value) -> io::Result<()> {
    let source = key(&edge["source"])?;
    let target = key(&edge["target"])?;
    if source == target {
        return Err(invalid("resolve saved graph self-edge"));
    }
    if !matches!(edge["type"].as_str().map(str::trim), Some("prod" | "dev" | "ext")) {
        return Err(invalid("resolve saved graph lifecycle"));
    }
    let outgoing = graph.entry(source).or_default();
    if let Some(previous) = outgoing
        .iter_mut()
        .find(|row| key(&row["target"]).ok().as_deref() == Some(target.as_str()))
    {
        *previous = edge.clone();
    } else {
        outgoing.push(edge.clone());
    }
    graph.entry(target).or_default();
    if graph.len() > 4096 {
        return Err(invalid("resolve saved graph node budget"));
    }
    Ok(())
}

use super::{Repository, direct, invalid, key, load};
use serde_json::Value;
use std::{collections::BTreeMap, io};

// Canonical snapping reuses saved flattened graphs before loading dependency
// Versions. Prove those graphs have the same ordered adjacency as the direct
// metadata before reconstructing the reachable graph ourselves.
pub(super) fn validate(version: &Value, repository: &mut Repository) -> io::Result<()> {
    let edges = saved_edges(version, repository)?;
    let edges = edges.as_array().ok_or_else(|| invalid("command saved dependency graph"))?;
    if edges.len() > 16384 {
        return Err(invalid("command saved graph edge budget"));
    }
    let mut nodes = BTreeMap::<String, (Value, Vec<Value>)>::new();
    for edge in edges {
        let source = key(&edge["source"])?;
        let target = key(&edge["target"])?;
        nodes
            .entry(target.clone())
            .or_insert_with(|| (edge["target"].clone(), Vec::new()));
        let outgoing = &mut nodes
            .entry(source)
            .or_insert_with(|| (edge["source"].clone(), Vec::new()))
            .1;
        if let Some(existing) = outgoing
            .iter_mut()
            .find(|existing| key(&existing["target"]).ok().as_deref() == Some(target.as_str()))
        {
            *existing = edge.clone();
        } else {
            outgoing.push(edge.clone());
        }
    }
    if nodes.len() > 4096 {
        return Err(invalid("command saved graph node budget"));
    }
    for (_, (identity, expected)) in nodes {
        let metadata = load(repository, &identity)?;
        if direct(&identity, &metadata)? != expected {
            return Err(invalid("command saved dependency graph differs from direct metadata"));
        }
    }
    Ok(())
}

fn saved_edges(version: &Value, repository: &mut Repository) -> io::Result<Value> {
    if let Some(value) = version
        .get("flattenedEdgesRef")
        .filter(|value| !value.is_null())
    {
        let reference = value
            .as_str()
            .map(str::trim)
            .filter(|reference| !reference.is_empty())
            .ok_or_else(|| invalid("command saved dependency graph reference"))?;
        return repository.source_json(reference);
    }
    Ok(version
        .get("flattenedEdges")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([])))
}

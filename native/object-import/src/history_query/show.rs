use super::invalid;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    versions: Vec<Version>,
    short_hash: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Version {
    hash: String,
    parents: Vec<String>,
    unrelated: Option<String>,
    squashed: Option<Vec<String>>,
}
struct Node {
    id: String,
    index: usize,
}
struct Edge {
    source: String,
    target: String,
    kind: &'static str,
}
pub(super) fn show(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    if request.versions.len() > 4096 {
        return Err(invalid("history graph record limit"));
    }
    let hashes = hashes(&request.versions)?;
    let mut nodes: Vec<Node> = Vec::new();
    for (index, hash) in hashes.iter().enumerate() {
        let id = identifier(hash, request.short_hash);
        if let Some(node) = nodes
            .iter_mut()
            .find(|node| node.id == id)
        {
            node.index = index;
        } else {
            nodes.push(Node { id, index });
        }
    }
    let edges = edges(&request)?;
    let order = order(&nodes, &edges)?;
    Ok(
        json!({"hashes":hashes,"nodes":nodes.iter().map(|node|json!({"id":node.id,"index":node.index})).collect::<Vec<_>>(),"edges":edges.iter().map(|edge|json!({"source":edge.source,"target":edge.target,"type":edge.kind})).collect::<Vec<_>>(),"order":order}),
    )
}
fn hashes(versions: &[Version]) -> io::Result<Vec<String>> {
    let mut hashes = Vec::new();
    let mut seen = HashSet::new();
    for version in versions {
        for hash in std::iter::once(&version.hash)
            .chain(&version.parents)
            .chain(version.squashed.iter().flatten())
            .chain(&version.unrelated)
        {
            let hash = hash.trim();
            crate::merge_history::hash(hash)?;
            if seen.insert(hash) {
                hashes.push(hash.to_owned());
            }
        }
    }
    if hashes.len() > 4096 {
        return Err(invalid("history graph node limit"));
    }
    Ok(hashes)
}
fn identifier(hash: &str, short: bool) -> String {
    let hash = hash.trim();
    if short { hash.get(..9).unwrap_or(hash).to_owned() } else { hash.to_owned() }
}
fn edges(request: &Request) -> io::Result<Vec<Edge>> {
    let mut edges: Vec<Edge> = Vec::new();
    for version in &request.versions {
        let source = identifier(&version.hash, request.short_hash);
        let targets = version.parents
            .iter()
            .map(|hash| (hash, "parent"))
            .chain(
                version.unrelated
                    .iter()
                    .map(|hash| (hash, "unrelated")),
            )
            .chain(
                version.squashed
                    .iter()
                    .flatten()
                    .filter(|hash| {
                        let trimmed = hash.trim();
                        !version.parents
                            .iter()
                            .any(|parent| parent.trim() == trimmed)
                    })
                    .map(|hash| (hash, "squashed")),
            );
        for (hash, kind) in targets {
            let target = identifier(hash, request.short_hash);
            insert_edge(&mut edges, &source, target, kind);
            if edges.len() > 65536 {
                return Err(invalid("history graph edge limit"));
            }
        }
    }
    Ok(edges)
}
fn insert_edge(edges: &mut Vec<Edge>, source: &str, target: String, kind: &'static str) {
    if let Some(edge) = edges
        .iter_mut()
        .find(|edge| edge.source == source && edge.target == target)
    {
        edge.kind = kind;
    } else {
        edges.push(Edge { source: source.to_owned(), target, kind });
    }
}
fn order(nodes: &[Node], edges: &[Edge]) -> io::Result<Vec<usize>> {
    let mut outgoing: Vec<Vec<usize>> = vec![Vec::new(); nodes.len()];
    for edge in edges {
        let source = nodes
            .iter()
            .position(|node| node.id == edge.source)
            .ok_or_else(|| invalid("unknown history source"))?;
        let target = nodes
            .iter()
            .position(|node| node.id == edge.target)
            .ok_or_else(|| invalid("unknown history target"))?;
        if !outgoing[source].contains(&target) {
            outgoing[source].push(target);
        }
    }
    let mut visited = HashSet::new();
    let mut active = HashSet::new();
    let mut sorted = Vec::new();
    for index in (0..nodes.len()).rev() {
        visit(index, &outgoing, &mut visited, &mut active, &mut sorted)?;
    }
    sorted.reverse();
    Ok(sorted)
}
fn visit(
    start: usize,
    outgoing: &[Vec<usize>],
    visited: &mut HashSet<usize>,
    active: &mut HashSet<usize>,
    sorted: &mut Vec<usize>,
) -> io::Result<()> {
    let mut stack = vec![(start, false)];
    while let Some((node, finish)) = stack.pop() {
        if finish {
            active.remove(&node);
            sorted.push(node);
            continue;
        }
        if active.contains(&node) {
            return Err(invalid("cyclic history graph"));
        }
        if !visited.insert(node) {
            continue;
        }
        active.insert(node);
        stack.push((node, true));
        for child in &outgoing[node] {
            stack.push((*child, false));
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Toposort {
    nodes: Vec<String>,
    edges: Vec<Link>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Link {
    source: String,
    target: String,
}
pub(super) fn toposort(input: Value) -> io::Result<Value> {
    let request: Toposort = serde_json::from_value(input).map_err(io::Error::other)?;
    if request.nodes.len() > 4096 || request.edges.len() > 65536 {
        return Err(invalid("history graph bounds"));
    }
    let mut seen = HashSet::new();
    let mut nodes = Vec::new();
    for (index, id) in request.nodes.into_iter().enumerate() {
        if id.len() > 32768 || !seen.insert(id.clone()) {
            return Err(invalid("history graph node identity"));
        }
        nodes.push(Node { id, index });
    }
    let edges = request.edges
        .into_iter()
        .map(|edge| Edge { source: edge.source, target: edge.target, kind: "parent" })
        .collect::<Vec<_>>();
    Ok(json!({"order":order(&nodes, &edges)?}))
}

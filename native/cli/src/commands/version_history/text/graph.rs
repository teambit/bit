//! Reproduce cleargraph node insertion, edge replacement, and topological order.
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub(super) struct Node {
    pub hash: String,
    pub edges: Vec<(usize, &'static str)>,
}

pub(super) struct Graph {
    pub nodes: Vec<Node>,
    indices: HashMap<String, usize>,
}

impl Graph {
    pub fn build(history: &Value, short: bool) -> Option<Self> {
        let rows = history["versions"].as_array()?;
        let mut graph = Self { nodes: Vec::new(), indices: HashMap::new() };
        let mut seen_rows = HashSet::new();
        for row in rows {
            let hash = row["hash"].as_str()?;
            if !seen_rows.insert(hash) {
                return None;
            }
            graph.add_node(hash)?;
            for hash in refs(row, "parents")?
                .into_iter()
                .chain(refs(row, "squashed")?)
            {
                graph.add_node(hash)?;
            }
            if let Some(hash) = optional(row, "unrelated")? {
                graph.add_node(hash)?;
            }
        }
        if short && !graph.unique_short_hashes() {
            return None;
        }
        for row in rows {
            graph.add_edges(row)?;
        }
        Some(graph)
    }

    fn unique_short_hashes(&self) -> bool {
        let unique: HashSet<_> = self.nodes
            .iter()
            .map(|node| &node.hash[..9])
            .collect();
        unique.len() == self.nodes.len()
    }

    fn add_node(&mut self, hash: &str) -> Option<()> {
        if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        if !self.indices.contains_key(hash) {
            if self.nodes.len() >= 10000 {
                return None;
            }
            self.indices.insert(hash.to_owned(), self.nodes.len());
            self.nodes.push(Node { hash: hash.to_owned(), edges: Vec::new() });
        }
        Some(())
    }

    fn add_edges(&mut self, row: &Value) -> Option<()> {
        let source = *self.indices.get(row["hash"].as_str()?)?;
        let parents = refs(row, "parents")?;
        for parent in &parents {
            self.edge(source, parent, "parent")?;
        }
        if let Some(unrelated) = optional(row, "unrelated")? {
            self.edge(source, unrelated, "unrelated")?;
        }
        for hash in refs(row, "squashed")? {
            if !parents.contains(&hash) {
                self.edge(source, hash, "squashed")?;
            }
        }
        Some(())
    }

    fn edge(&mut self, source: usize, hash: &str, kind: &'static str) -> Option<()> {
        let target = *self.indices.get(hash)?;
        let edges = &mut self.nodes[source].edges;
        if let Some(edge) = edges
            .iter_mut()
            .find(|(index, _)| *index == target)
        {
            edge.1 = kind;
        } else {
            if edges.len() >= 10000 {
                return None;
            }
            edges.push((target, kind));
        }
        Some(())
    }

    pub fn order(&self) -> Option<Vec<usize>> {
        let mut states = vec![0u8; self.nodes.len()];
        let mut output = Vec::new();
        for index in (0..self.nodes.len()).rev() {
            self.visit(index, &mut states, &mut output)?;
        }
        output.reverse();
        Some(output)
    }

    fn visit(&self, index: usize, states: &mut [u8], output: &mut Vec<usize>) -> Option<()> {
        if states[index] == 2 {
            return Some(());
        }
        let mut stack = vec![(index, self.nodes[index].edges.len())];
        states[index] = 1;
        while let Some((node, remaining)) = stack.last_mut() {
            if *remaining == 0 {
                states[*node] = 2;
                output.push(*node);
                stack.pop();
                continue;
            }
            *remaining -= 1;
            let child = self.nodes[*node].edges[*remaining].0;
            match states[child] {
                1 => return None,
                2 => continue,
                _ => {
                    states[child] = 1;
                    stack.push((child, self.nodes[child].edges.len()));
                }
            }
        }
        Some(())
    }
}

fn refs<'a>(row: &'a Value, key: &str) -> Option<Vec<&'a str>> {
    match row.get(key) {
        None | Some(Value::Null) if key == "squashed" => Some(Vec::new()),
        Some(Value::Array(values)) => values
            .iter()
            .map(Value::as_str)
            .collect(),
        _ => None,
    }
}

fn optional<'a>(row: &'a Value, key: &str) -> Option<Option<&'a str>> {
    match row.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::String(value)) => Some(Some(value)),
        _ => None,
    }
}

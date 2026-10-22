//! Component ID graph model, filtering, and SVG serialization for `bit graph`.

use crate::commands::scope_set::Failure;
use serde::Serialize;
use std::{
    collections::{HashSet, VecDeque},
    env,
    fmt::Write,
    fs,
    path::PathBuf,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct GraphEdge {
    pub id: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    pub attr: String,
    pub bidirectional: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct CompGraph {
    pub nodes: Vec<String>,
    pub edges: Vec<GraphEdge>,
}

impl CompGraph {
    pub(super) fn add_node(&mut self, id: String) {
        if !self.nodes.contains(&id) {
            self.nodes.push(id);
        }
    }

    pub(super) fn add_edge(&mut self, source_id: String, target_id: String, attr: &str) {
        self.add_node(source_id.clone());
        self.add_node(target_id.clone());
        let edge_id = format!("{source_id} -> {target_id}");
        if let Some(existing) = self.edges
            .iter_mut()
            .find(|edge| edge.id == edge_id)
        {
            attr.clone_into(&mut existing.attr);
        } else {
            self.edges.push(GraphEdge {
                id: edge_id,
                source_id,
                target_id,
                attr: attr.to_owned(),
                bidirectional: false,
            });
        }
    }

    pub(super) fn filter_to_seeders(&mut self, seeders: &[String]) {
        let reachable = self.reachable_from(seeders);
        self.nodes.retain(|node| reachable.contains(node));
        self.edges.retain(|edge| {
            reachable.contains(&edge.source_id) && reachable.contains(&edge.target_id)
        });
    }

    fn reachable_from(&self, seeders: &[String]) -> HashSet<String> {
        let mut reachable = HashSet::new();
        let mut queue = VecDeque::new();
        for seeder in seeders {
            if self.nodes.contains(seeder) && reachable.insert(seeder.clone()) {
                queue.push_back(seeder.clone());
            }
        }
        while let Some(curr) = queue.pop_front() {
            for target in self.direct_targets(&curr) {
                if reachable.insert(target.to_owned()) {
                    queue.push_back(target.to_owned());
                }
            }
        }
        reachable
    }

    pub(super) fn filter_local_only(&mut self, local_ids: &[String]) {
        let allowed: HashSet<&str> = local_ids
            .iter()
            .map(String::as_str)
            .collect();
        self.nodes.retain(|node| allowed.contains(node.as_str()));
        self.edges.retain(|edge| {
            allowed.contains(edge.source_id.as_str()) && allowed.contains(edge.target_id.as_str())
        });
    }

    pub(super) fn filter_cycles(&mut self) {
        let cycle_nodes: HashSet<String> = self.nodes
            .iter()
            .filter(|node| self.can_reach(node, node))
            .cloned()
            .collect();
        let kept_edges = self.edges
            .iter()
            .filter(|edge| {
                cycle_nodes.contains(&edge.source_id)
                    && cycle_nodes.contains(&edge.target_id)
                    && self.can_reach(&edge.target_id, &edge.source_id)
            })
            .cloned()
            .collect();
        self.nodes.retain(|node| cycle_nodes.contains(node));
        self.edges = kept_edges;
    }

    fn can_reach(&self, start: &str, goal: &str) -> bool {
        let mut visited = HashSet::new();
        let mut queue: VecDeque<&str> = self
            .direct_targets(start)
            .into_iter()
            .collect();
        for &target in &queue {
            visited.insert(target);
        }
        while let Some(curr) = queue.pop_front() {
            if curr == goal {
                return true;
            }
            for next in self.direct_targets(curr) {
                if visited.insert(next) {
                    queue.push_back(next);
                }
            }
        }
        false
    }

    fn direct_targets(&self, src: &str) -> Vec<&str> {
        self.edges
            .iter()
            .filter(|edge| edge.source_id == src)
            .map(|edge| edge.target_id.as_str())
            .collect()
    }

    pub(super) fn sort_deterministic(&mut self) {
        self.nodes.sort();
        self.edges.sort_by(|left, right| left.id.cmp(&right.id));
    }
}

pub(super) fn write_svg_file(graph: &CompGraph) -> Result<PathBuf, Failure> {
    let mut rand_bytes = [0u8; 4];
    let _ = getrandom::fill(&mut rand_bytes);
    let mut rand_hex = String::with_capacity(8);
    for byte in &rand_bytes {
        let _ = write!(rand_hex, "{byte:02x}");
    }
    let svg_path = env::temp_dir().join(format!("{rand_hex}.svg"));
    let mut body = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"400\">\n",
    );
    for (idx, node) in graph.nodes.iter().enumerate() {
        let y_pos = 30 + idx * 24;
        let _ = writeln!(body, r#"  <text x="20" y="{y_pos}">{node}</text>"#);
    }
    body.push_str("</svg>\n");
    fs::write(&svg_path, body).map_err(|err| Failure::Declined(err.to_string()))?;
    Ok(svg_path)
}

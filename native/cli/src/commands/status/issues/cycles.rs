//! Dependency cycles among the captured components (`Graph.findCycles()`),
//! found with Tarjan's algorithm.

use super::Component;
use std::collections::{HashMap, HashSet};

/// Components in a dependency cycle, self-dependencies included: the
/// members of strongly connected components larger than one node.
pub fn cyclic(components: &[Component]) -> HashSet<&str> {
    let mut index: HashMap<&str, usize> = HashMap::with_capacity(components.len() * 2);
    for (position, component) in components.iter().enumerate() {
        let raw = component.identity.as_str().trim();
        index.insert(raw, position);
        index
            .entry(strip_version(raw))
            .or_insert(position);
    }
    let edges: Vec<Vec<usize>> = components
        .iter()
        .map(|component| {
            component.dependencies
                .iter()
                .filter_map(|id| {
                    let trimmed = id.as_str().trim();
                    index
                        .get(trimmed)
                        .or_else(|| index.get(strip_version(trimmed)))
                        .copied()
                })
                .collect()
        })
        .collect();
    let mut tarjan = Tarjan::new(&edges);
    (0..components.len()).for_each(|node| tarjan.visit(node));
    tarjan.components
        .iter()
        .filter(|scc| scc.len() > 1 || edges[scc[0]].contains(&scc[0]))
        .flatten()
        .map(|&node| components[node].identity.as_str())
        .collect()
}

fn strip_version(id: &str) -> &str {
    match id.rfind('@') {
        Some(index) if index > 0 && !id[index + 1..].contains('/') => id[..index].trim(),
        _ => id.trim(),
    }
}

struct Tarjan<'e> {
    edges: &'e [Vec<usize>],
    index: Vec<Option<usize>>,
    low: Vec<usize>,
    on_stack: Vec<bool>,
    stack: Vec<usize>,
    next: usize,
    components: Vec<Vec<usize>>,
}

impl<'e> Tarjan<'e> {
    fn new(edges: &'e [Vec<usize>]) -> Self {
        let size = edges.len();
        Self {
            edges,
            index: vec![None; size],
            low: vec![0; size],
            on_stack: vec![false; size],
            stack: Vec::new(),
            next: 0,
            components: Vec::new(),
        }
    }

    /// Iterative, so deep dependency chains cannot overflow the stack.
    fn visit(&mut self, start: usize) {
        if self.index[start].is_some() {
            return;
        }
        let mut work = vec![(start, 0)];
        self.open(start);
        while let Some((node, edge)) = work.pop() {
            match self.edges[node].get(edge) {
                Some(&next) => {
                    work.push((node, edge + 1));
                    self.follow(node, next, &mut work);
                }
                None => self.finish(node, work.last().map(|&(parent, _)| parent)),
            }
        }
    }

    /// The edge `node -> next`: descend into an unvisited node, or lower
    /// `node`'s link through one still on the stack.
    fn follow(&mut self, node: usize, next: usize, work: &mut Vec<(usize, usize)>) {
        match self.index[next] {
            None => {
                self.open(next);
                work.push((next, 0));
            }
            Some(index) if self.on_stack[next] => self.low[node] = self.low[node].min(index),
            Some(_) => {}
        }
    }

    /// All of `node`'s edges are done: pass its link up, close its component.
    fn finish(&mut self, node: usize, parent: Option<usize>) {
        if let Some(parent) = parent {
            self.low[parent] = self.low[parent].min(self.low[node]);
        }
        if Some(self.low[node]) == self.index[node] {
            self.close(node);
        }
    }

    fn open(&mut self, node: usize) {
        self.index[node] = Some(self.next);
        self.low[node] = self.next;
        self.next += 1;
        self.stack.push(node);
        self.on_stack[node] = true;
    }

    fn close(&mut self, root: usize) {
        let mut component = Vec::new();
        while let Some(node) = self.stack.pop() {
            self.on_stack[node] = false;
            component.push(node);
            if node == root {
                break;
            }
        }
        self.components.push(component);
    }
}

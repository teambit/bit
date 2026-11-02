//! Dependency cycles among the captured components (`Graph.findCycles()`),
//! found with Tarjan's algorithm.
//!
//! [`filter_graph_for_cycles`] and cycle detection helpers inspect [`Component`] dependency edges across [`Path`] roots.

use super::Component;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

/// Prunes non-workspace dependency edges from `graph` before running Tarjan's cycle detection for `components`.
pub(super) fn filter_graph_for_cycles(
    root: &Path,
    components: &[Component],
    graph: &[Component],
) -> Vec<Component> {
    let workspace_ids: HashSet<&str> = components
        .iter()
        .map(|component| component.identity.trim())
        .collect();
    let unresolved: HashSet<&str> = components
        .iter()
        .filter(|component| has_unresolved_deps(root, component))
        .map(|component| component.identity.trim())
        .collect();
    graph
        .iter()
        .map(|component| {
            if workspace_ids.contains(component.identity.trim()) {
                return component.clone();
            }
            let mut ext = component.clone();
            ext.dependencies.retain(|dep| {
                let dep = dep.trim();
                !workspace_ids.contains(dep) || unresolved.contains(dep)
            });
            ext
        })
        .collect()
}

#[inline]
fn has_unresolved_deps(root: &Path, component: &Component) -> bool {
    let package_name = component.package_name.trim();
    if !package_name.is_empty()
        && !root
            .join("node_modules")
            .join(package_name)
            .exists()
    {
        return true;
    }
    component.issues
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    matches!(
                        row["type"].as_str(),
                        Some(
                            "MissingPackagesDependenciesOnFs"
                                | "MissingDependenciesOnFs"
                                | "UntrackedDependencies"
                                | "ParseErrors"
                                | "ResolveErrors",
                        ),
                    )
                })
        })
}

/// Components in a dependency cycle, self-dependencies included: the
/// members of strongly connected components larger than one node.
#[must_use]
pub fn cyclic(components: &[Component]) -> HashSet<&str> {
    let mut index: HashMap<&str, usize> = HashMap::with_capacity(components.len() * 2);
    for (position, component) in components.iter().enumerate() {
        let raw = component.identity.as_str().trim();
        if raw.is_empty() {
            continue;
        }
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
                    if trimmed.is_empty() {
                        return None;
                    }
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
        .flat_map(|&node| {
            let raw = components[node].identity.as_str();
            [raw, raw.trim()]
        })
        .collect()
}

#[inline]
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
    #[inline]
    fn new(edges: &'e [Vec<usize>]) -> Self {
        let size = edges.len();
        Self {
            edges,
            index: vec![None; size],
            low: vec![0; size],
            on_stack: vec![false; size],
            stack: Vec::with_capacity(size),
            next: 0,
            components: Vec::with_capacity(size),
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
    #[inline]
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
    #[inline]
    fn finish(&mut self, node: usize, parent: Option<usize>) {
        if let Some(parent) = parent {
            self.low[parent] = self.low[parent].min(self.low[node]);
        }
        if Some(self.low[node]) == self.index[node] {
            self.close(node);
        }
    }

    #[inline]
    fn open(&mut self, node: usize) {
        self.index[node] = Some(self.next);
        self.low[node] = self.next;
        self.next += 1;
        self.stack.push(node);
        self.on_stack[node] = true;
    }

    #[inline]
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

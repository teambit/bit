//! The ordering of `cleargraph.toposort()` for component Version parents.

use super::{array, decline, text};
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn ordered_parents(logs: &[Value]) -> io::Result<Vec<&Value>> {
    let edges = graph_edges(logs)?;
    let mut postorder = topological_postorder(&edges)?;
    postorder.reverse();
    Ok(postorder
        .into_iter()
        .map(|index| &logs[index])
        .collect())
}

fn graph_edges(logs: &[Value]) -> io::Result<Vec<Vec<usize>>> {
    let indices: HashMap<&str, usize> = logs
        .iter()
        .enumerate()
        .map(|(index, row)| text(row.get("hash")).map(|hash| (hash, index)))
        .collect::<io::Result<_>>()?;
    if indices.len() != logs.len() {
        return Err(decline("log duplicate graph node"));
    }
    logs.iter()
        .map(|row| {
            array(row.get("parents"), "log parents")?
                .iter()
                .map(|parent| {
                    indices
                        .get(text(Some(parent))?)
                        .copied()
                        .ok_or_else(|| decline("log filtered parent graph"))
                })
                .collect()
        })
        .collect()
}

fn topological_postorder(edges: &[Vec<usize>]) -> io::Result<Vec<usize>> {
    // Cleargraph visits nodes and outgoing edges from last to first, then
    // fills the result from the end. An explicit stack handles long histories.
    let mut state = vec![0_u8; edges.len()];
    let mut result = Vec::with_capacity(edges.len());
    for root in (0..edges.len()).rev() {
        if state[root] == 0 {
            visit(root, edges, &mut state, &mut result)?;
        }
    }
    Ok(result)
}

fn visit(
    root: usize,
    edges: &[Vec<usize>],
    state: &mut [u8],
    result: &mut Vec<usize>,
) -> io::Result<()> {
    state[root] = 1;
    let mut stack = vec![(root, edges[root].len())];
    while let Some((node, remaining)) = stack.last_mut() {
        if *remaining == 0 {
            state[*node] = 2;
            result.push(*node);
            stack.pop();
            continue;
        }
        *remaining -= 1;
        let child = edges[*node][*remaining];
        match state[child] {
            0 => {
                state[child] = 1;
                stack.push((child, edges[child].len()));
            }
            1 => return Err(decline("log cyclic parent graph")),
            _ => {}
        }
    }
    Ok(())
}

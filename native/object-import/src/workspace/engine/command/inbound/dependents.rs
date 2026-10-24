//! `DependentsGetter`: ordered workspace-to-target paths, excluding direct edges.
pub(in crate::workspace::engine) use stages::{Complete, complete};
pub(super) use stages::{Pending, begin, needed};

use super::{Prepare, Target, dependencies, invalid};
use std::{
    collections::{HashMap, HashSet},
    io,
};

mod stages;
mod traversal;

fn select(
    adjacency: &HashMap<String, Vec<Target>>,
    sources: &[String],
    targets: &[Target],
    via: &[String],
) -> io::Result<Vec<Target>> {
    let ends = targets
        .iter()
        .map(dependencies::identity)
        .collect::<io::Result<HashSet<_>>>()?;
    let through = via
        .iter()
        .map(|id| bare(id).to_owned())
        .collect::<Vec<_>>();
    let paths = paths(adjacency, sources, &ends, &through)?;
    let mut unique = Vec::new();
    for path in paths {
        for id in path {
            if !unique.contains(&id) {
                unique.push(id);
            }
        }
    }
    let mut excluded = sources
        .iter()
        .map(|id| bare(id).to_owned())
        .collect::<HashSet<_>>();
    excluded.extend(ends);
    selected(&unique, &mut excluded)
}

fn selected(ids: &[String], excluded: &mut HashSet<String>) -> io::Result<Vec<Target>> {
    let mut result = Vec::new();
    for id in ids {
        let identity = bare(id);
        if !excluded.insert(identity.to_owned()) {
            continue;
        }
        let mut target = super::requested_target(id)?;
        if ids
            .iter()
            .filter(|other| bare(other) == identity)
            .count()
            > 1
        {
            target.version = "latest".into();
        }
        result.push(target);
    }
    Ok(result)
}

fn paths(
    adjacency: &HashMap<String, Vec<Target>>,
    sources: &[String],
    ends: &HashSet<String>,
    via: &[String],
) -> io::Result<Vec<Vec<String>>> {
    let mut queue = traversal::Queue::from_sources(sources)?;
    let mut visited = HashSet::new();
    let mut result = Vec::new();
    let mut count = 0;
    while let Some(path) = queue.pop() {
        count += 1;
        if count > 65536 {
            return Err(invalid("inbound dependent graph traversal limit"));
        }
        let node = path.last().ok_or_else(|| invalid("inbound dependent path"))?;
        if ends.contains(bare(node)) {
            if eligible_path(&path, via) {
                result.push(path);
            } else {
                queue.release(&path);
            }
        } else {
            visited.insert(node.clone());
            enqueue(adjacency, &path, &visited, &mut queue)?;
            queue.release(&path);
        }
    }
    result.sort_by_key(Vec::len);
    Ok(result)
}

fn enqueue(
    adjacency: &HashMap<String, Vec<Target>>,
    path: &[String],
    visited: &HashSet<String>,
    queue: &mut traversal::Queue,
) -> io::Result<()> {
    for target in adjacency
        .get(path.last().unwrap())
        .into_iter()
        .flatten()
    {
        let id = if target.version.is_empty() {
            dependencies::identity(target)?
        } else {
            dependencies::versioned(target)?
        };
        if !visited.contains(&id) {
            queue.push(path, &id)?;
        }
    }
    Ok(())
}
fn bare(id: &str) -> &str {
    id.split('@').next().unwrap_or(id)
}

#[cfg(test)]
mod tests;

fn eligible_path(path: &[String], via: &[String]) -> bool {
    path.len() >= 3
        && via
            .iter()
            .all(|id| path.iter().any(|part| bare(part) == id))
}

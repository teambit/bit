//! Writing fetched objects into the workspace scope (`ObjectFetcher.fetchAndWrite`):
//! immutable objects as they are, Version and `VersionHistory` merged, then the
//! Component objects merged across remotes, indexed, and their remote heads recorded.

use super::{
    component::{keep_existing_version, merge_component, merge_version_history},
    fetch::PerRemote,
    objects::{IndexRow, Parsed, RemoteRef, Repo, compress_json, invalid, parse},
    tar::ObjectItem,
};
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::BTreeSet, io};

/// `DEFAULT_LANE`.
pub const MAIN: &str = "main";

/// What one fetch added to the scope.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Written {
    pub objects: usize,
    /// Hashes of the Component objects received.
    pub components: BTreeSet<String>,
}

/// The Component objects received for one component, per remote.
type Received = IndexMap<String, Vec<(String, Value)>>;

/// Persist every remote's objects, then merge and write the components.
pub fn persist(repo: &Repo, fetched: &PerRemote) -> io::Result<Written> {
    let mut received = Received::new();
    let mut written = Written::default();
    for (remote, items) in fetched {
        for item in items {
            if write_object(repo, remote, item, &mut received)? {
                written.objects += 1;
            }
        }
    }
    written.components = received.keys().cloned().collect();
    let heads = write_components(repo, &received)?;
    for (scope, refs) in heads {
        repo.add_remote_refs(&scope, MAIN, &refs)?;
    }
    Ok(written)
}

/// Write one object; Components are collected for the merge. Returns whether
/// the scope changed.
fn write_object(
    repo: &Repo,
    remote: &str,
    item: &ObjectItem,
    received: &mut Received,
) -> io::Result<bool> {
    let parsed = parse(&item.compressed)?;
    match parsed.kind.as_str() {
        "Component" => {
            received
                .entry(item.hash.clone())
                .or_default()
                .push((remote.to_string(), parsed.json()?));
            Ok(false)
        }
        "Version" => write_version(repo, item, &parsed),
        "VersionHistory" => write_version_history(repo, item, &parsed),
        "Lane" => Err(invalid("ObjectsWritable does not support lanes")),
        _ if repo.exists(&item.hash) => Ok(false),
        _ => repo.write_raw(&item.hash, &item.compressed).map(|()| true),
    }
}

fn write_version(repo: &Repo, item: &ObjectItem, parsed: &Parsed) -> io::Result<bool> {
    if let Some(existing) = repo.read_json(&item.hash)? {
        let incoming = parsed.json()?;
        if existing == incoming || keep_existing_version(&existing, &incoming) {
            return Ok(false);
        }
    }
    repo.write_raw(&item.hash, &item.compressed)?;
    Ok(true)
}

fn write_version_history(repo: &Repo, item: &ObjectItem, parsed: &Parsed) -> io::Result<bool> {
    let Some(existing) = repo.read_json(&item.hash)? else {
        repo.write_raw(&item.hash, &item.compressed)?;
        return Ok(true);
    };
    let merged = merge_version_history(&existing, &parsed.json()?);
    if merged == existing {
        return Ok(false);
    }
    repo.write_raw(&item.hash, &compress_json("VersionHistory", &item.hash, &merged)?)?;
    Ok(true)
}

/// `MultipleComponentMerger.merge` and `mergeAndPersistComponents`. Returns the
/// remote heads to record per origin scope.
fn write_components(
    repo: &Repo,
    received: &Received,
) -> io::Result<IndexMap<String, Vec<RemoteRef>>> {
    let mut heads: IndexMap<String, Vec<RemoteRef>> = IndexMap::new();
    let mut rows = Vec::new();
    for (hash, per_remote) in received {
        let existing = repo.read_json(hash)?;
        let (merged, remote_head) = merge_received(existing.as_ref(), per_remote)?;
        let scope = merged["scope"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let name = merged["name"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        if existing.as_ref() != Some(&merged) {
            repo.write_raw(hash, &compress_json("Component", hash, &merged)?)?;
        }
        rows.push(IndexRow::Component {
            scope: scope.clone(),
            name: name.clone(),
            hash: hash.clone(),
        });
        if let Some(head) = remote_head {
            heads
                .entry(scope.clone())
                .or_default()
                .push(RemoteRef { scope, name, head });
        }
    }
    repo.index_add(&rows)?;
    Ok(heads)
}

/// One component from one or more remotes: the origin wins, others merge in order.
fn merge_received(
    existing: Option<&Value>,
    per_remote: &[(String, Value)],
) -> io::Result<(Value, Option<String>)> {
    let first = &per_remote[0].1;
    let scope = first["scope"].as_str().unwrap_or_default();
    if let Some((_, origin)) = per_remote
        .iter()
        .find(|(remote, _)| remote == scope)
    {
        let merged = merge_component(existing, origin, true)?;
        return Ok((merged, origin["head"].as_str().map(str::to_string)));
    }
    let mut merged = existing.cloned();
    for (_, incoming) in per_remote {
        merged = Some(merge_component(merged.as_ref(), incoming, false)?);
    }
    Ok((merged.unwrap_or_else(|| first.clone()), None))
}

//! Writing fetched objects into the workspace scope (`ObjectFetcher.fetchAndWrite`):
//! immutable objects as they are, Version and `VersionHistory` merged, then the
//! Component objects merged across remotes, indexed, and their remote heads recorded.

use super::{
    component::{keep_existing_version, merge_component, merge_version_history},
    fetch::PerRemote,
    objects::{IndexRow, Parsed, RemoteRef, Repo, compress_json, invalid, parse},
    tar::ObjectItem,
};
use crate::output::Output;
use indexmap::IndexMap;
use serde_json::Value;
use std::{cell::Cell, collections::BTreeSet, io};

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

/// `showProgress`: every 100 objects handed to the write queue restart the
/// loader with `<importing ...>. downloaded N objects.` (skipped on CI).
pub struct Progress<'a> {
    output: &'a Output,
    message: String,
    added: Cell<usize>,
}

impl<'a> Progress<'a> {
    /// `None` when `CI` is set, as `showProgress` prints nothing there.
    #[must_use]
    pub fn new(output: &'a Output, message: &str) -> Option<Self> {
        if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
            return None;
        }
        Some(Self { output, message: message.to_string(), added: Cell::new(0) })
    }

    fn added(&self) {
        let added = self.added.get() + 1;
        self.added.set(added);
        if added.is_multiple_of(100) {
            self.output.status(&format!("{}. downloaded {added} objects.", self.message));
        }
    }
}

/// Persist every remote's objects, then merge and write the components.
pub fn persist(
    repo: &Repo,
    fetched: &PerRemote,
    progress: Option<&Progress<'_>>,
) -> io::Result<Written> {
    let mut received = Received::new();
    let mut written = Written::default();
    for (remote, items) in fetched {
        for item in items {
            if write_object(repo, remote, item, &mut received)? {
                written.objects += 1;
            }
            if let Some(progress) = progress {
                progress.added();
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
        let scope = component_field(&merged, "scope").to_string();
        let name = component_field(&merged, "name").to_string();
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
    let scope = component_field(first, "scope");
    if let Some((_, origin)) = per_remote
        .iter()
        .find(|(remote, _)| remote == scope)
    {
        let merged = merge_component(existing, origin, true)?;
        let head = origin["head"]
            .as_str()
            .or_else(|| origin["head"]["hash"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        return Ok((merged, head));
    }
    let mut merged = existing.cloned();
    for (_, incoming) in per_remote {
        merged = Some(merge_component(merged.as_ref(), incoming, false)?);
    }
    Ok((merged.unwrap_or_else(|| first.clone()), None))
}

fn component_field<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field]
        .as_str()
        .or_else(|| value["id"][field].as_str())
        .map_or("", str::trim)
}

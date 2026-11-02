//! `dedupeDependencies`: hoist what the components agree on into the root.
//!
//! Indexes per-component dependency ranges ([`IndexEntry`]) and delegates conflict resolution to [`hoist`].

mod hoist;
#[cfg(test)]
mod tests;

use super::deps::{DepsObject, Field};
use crate::model::{DependencyMap, PolicyEntry};
use indexmap::IndexMap;

/// One component's requirement of a package (`PackageNameIndexComponentItem`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Item {
    pub(super) range: String,
    /// The component package name.
    pub(super) origin: String,
    pub(super) field: Field,
}

/// All requirements of one package, plus the workspace policy version to keep.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct IndexEntry {
    pub(super) items: Vec<Item>,
    pub(super) preserved: Option<(String, Field)>,
}

/// The dedupe result (`DedupedDependencies`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Deduped {
    pub(super) root: DepsObject,
    pub(super) components: IndexMap<String, DepsObject>,
    pub(super) peer_conflicts: Vec<String>,
}

/// `rootPolicy.toManifest()`: `dependencies` and `peerDependencies`, snaps as semver.
#[inline]
pub(super) fn policy_manifest(policy: &[PolicyEntry]) -> DepsObject {
    let mut object = DepsObject::default();
    for entry in policy {
        let name = entry.name.trim();
        if name.is_empty() {
            continue;
        }
        let field = Field::of(entry.lifecycle);
        object
            .get_mut(field)
            .insert(name.to_owned(), super::versions::snap_to_semver(&entry.version));
    }
    object
}

/// `indexByDepId`.
fn index_by_dep_id(
    policy: &[PolicyEntry],
    components: &IndexMap<String, DepsObject>,
) -> IndexMap<String, IndexEntry> {
    let mut index: IndexMap<String, IndexEntry> = IndexMap::new();
    for (origin, deps) in components {
        insert_component_deps(&mut index, origin, deps);
    }
    for entry in policy
        .iter()
        .filter(|entry| entry.preserve.unwrap_or(true))
    {
        if let Some(existing) = index.get_mut(entry.name.trim()) {
            let version = super::versions::snap_to_semver(&entry.version);
            if !version.is_empty() {
                existing.preserved = Some((version, Field::of(entry.lifecycle)));
            }
        }
    }
    index
}

#[inline]
fn insert_component_deps(
    index: &mut IndexMap<String, IndexEntry>,
    origin: &str,
    deps: &DepsObject,
) {
    for field in Field::ALL {
        for (name, range) in deps.get(field) {
            let name = name.trim();
            if !name.is_empty() {
                let item =
                    Item { range: range.trim().to_owned(), origin: origin.to_owned(), field };
                index
                    .entry(name.to_owned())
                    .or_default()
                    .items
                    .push(item);
            }
        }
    }
}

/// `mergeWithRootDeps`: the workspace policy always lands in the root.
#[inline]
fn merge_with_root(mut root: DepsObject, deduped: &mut Deduped) {
    for field in Field::ALL {
        for (name, range) in std::mem::take(root.get_mut(field)) {
            if !deduped.root.has_direct(&name) {
                deduped.root.get_mut(field).insert(name, range);
            }
        }
    }
}

/// `dedupeDependencies(rootPolicy, componentDependenciesMap, { dedupePeerDependencies })`.
#[inline]
pub(super) fn dedupe(
    policy: &[PolicyEntry],
    components: &IndexMap<String, DepsObject>,
    dedupe_peers: bool,
) -> std::io::Result<Deduped> {
    let index = index_by_dep_id(policy, components);
    let mut deduped = hoist::hoist(&index, dedupe_peers)?;
    merge_with_root(policy_manifest(policy), &mut deduped);
    Ok(deduped)
}

/// `excludeWorkspaceDependencies`: drop `file:` and `workspace:` specs.
#[inline]
pub(super) fn exclude_workspace(map: &DependencyMap) -> DependencyMap {
    map.iter()
        .filter(|(_, spec)| {
            let trimmed = spec.trim();
            !trimmed.starts_with("file:") && !trimmed.starts_with("workspace:")
        })
        .map(|(name, spec)| (name.clone(), spec.clone()))
        .collect()
}

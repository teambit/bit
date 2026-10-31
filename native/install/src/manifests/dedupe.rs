//! `dedupeDependencies`: hoist what the components agree on into the root.

mod hoist;
#[cfg(test)]
mod tests;

use super::deps::{DepsObject, Field, truthy};
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
#[derive(Debug, Default, Clone)]
pub(super) struct IndexEntry {
    pub(super) items: Vec<Item>,
    pub(super) preserved: Option<(String, Field)>,
}

/// The dedupe result (`DedupedDependencies`).
#[derive(Debug, Default, Clone)]
pub(super) struct Deduped {
    pub(super) root: DepsObject,
    pub(super) components: IndexMap<String, DepsObject>,
    pub(super) peer_conflicts: Vec<String>,
}

/// `rootPolicy.toManifest()`: `dependencies` and `peerDependencies`, snaps as semver.
pub(super) fn policy_manifest(policy: &[PolicyEntry]) -> DepsObject {
    let mut object = DepsObject::default();
    for entry in policy {
        let field = Field::of(entry.lifecycle);
        object
            .get_mut(field)
            .insert(entry.name.clone(), super::versions::snap_to_semver(&entry.version));
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
        for field in Field::ALL {
            for (name, range) in deps.get(field) {
                let item = Item { range: range.clone(), origin: origin.clone(), field };
                index
                    .entry(name.clone())
                    .or_default()
                    .items
                    .push(item);
            }
        }
    }
    for entry in policy
        .iter()
        .filter(|entry| entry.preserve.unwrap_or(true))
    {
        if let Some(existing) = index.get_mut(&entry.name) {
            existing.preserved = Some((entry.version.clone(), Field::of(entry.lifecycle)));
        }
    }
    index
}

/// `mergeWithRootDeps`: the workspace policy always lands in the root.
fn merge_with_root(root: &DepsObject, deduped: &mut Deduped) {
    for field in Field::ALL {
        for (name, range) in root.get(field) {
            let exists = [Field::Dependencies, Field::DevDependencies, Field::PeerDependencies]
                .into_iter()
                .any(|existing| truthy(deduped.root.get(existing), name));
            if !exists {
                deduped.root.get_mut(field).insert(name.clone(), range.clone());
            }
        }
    }
}

/// `dedupeDependencies(rootPolicy, componentDependenciesMap, { dedupePeerDependencies })`.
pub(super) fn dedupe(
    policy: &[PolicyEntry],
    components: &IndexMap<String, DepsObject>,
    dedupe_peers: bool,
) -> std::io::Result<Deduped> {
    let index = index_by_dep_id(policy, components);
    let mut deduped = hoist::hoist(&index, dedupe_peers)?;
    merge_with_root(&policy_manifest(policy), &mut deduped);
    Ok(deduped)
}

/// `excludeWorkspaceDependencies`: drop `file:` and `workspace:` specs.
pub(super) fn exclude_workspace(map: &DependencyMap) -> DependencyMap {
    map.iter()
        .filter(|(_, spec)| {
            let trimmed = spec.trim();
            !trimmed.starts_with("file:") && !trimmed.starts_with("workspace:")
        })
        .map(|(name, spec)| (name.clone(), spec.clone()))
        .collect()
}

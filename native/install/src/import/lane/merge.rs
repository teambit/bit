//! `sources.mergeLane(lane, isImport = true)` followed by `lanes.saveLane`
//! (`ImportComponents.mergeAndSaveLaneObject`): fold the fetched lane into the
//! local lane object of the same id, keeping local entries that diverged.

#[cfg(test)]
mod tests;

use super::{
    RemoteLane,
    history::{self, Identity},
    object::{LaneComponent, LaneObject, OLD_LANE_SCHEMA},
};
use crate::import::{
    bitmap::Id,
    objects::{IndexRow, Repo, component_hash, compress_json, version_history_hash},
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
};

const HISTORY_MESSAGE: &str = "import (merge from remote)";

/// Merge the remote lane into the local scope and save it when it changed.
pub fn merge_and_save(repo: &Repo, remote: &RemoteLane, identity: &Identity) -> io::Result<()> {
    let incoming = LaneObject::parse(&remote.object, &remote.hash);
    let merged = merge(repo, &incoming)?;
    let save_history = !incoming.is_equal(&merged);
    save(repo, &merged, save_history, identity)
}

/// `sources.mergeLane` for an import. Returns the lane to save (`mergeLane`).
fn merge(repo: &Repo, incoming: &LaneObject) -> io::Result<LaneObject> {
    let Some(mut existing) = load_existing(repo, incoming)? else {
        return Ok(incoming.clone());
    };
    for (component, hidden) in entries(incoming) {
        merge_component(repo, &mut existing, &component, hidden)?;
    }
    reconcile_hidden(&mut existing, incoming);
    if existing.changed && existing.includes_deleted_data() && !incoming.includes_deleted_data() {
        existing.schema = OLD_LANE_SCHEMA.to_string();
    }
    if existing.override_update_dependents {
        existing.override_update_dependents = false;
        existing.changed = true;
    }
    Ok(existing)
}

/// The local lane with the same id (which must have the same hash), or the
/// local lane with the same hash under another id, renamed to the incoming id.
fn load_existing(repo: &Repo, incoming: &LaneObject) -> io::Result<Option<LaneObject>> {
    if let Some(hash) = repo.lane_hash(&incoming.scope, &incoming.name)? {
        if hash != incoming.hash {
            return Err(io::Error::other(format!(
                r#"unable to merge "{}" lane. a lane with the same id already exists with a different hash.
you can either export to a different scope (use bit lane track) or create a new lane with a different name and export.
otherwise, to collaborate on the same lane as the remote, you'll need to remove the local lane and import the remote lane (bit lane import)"#,
                incoming.id(),
            )));
        }
        return Ok(repo.read_json(&hash)?.map(|object| LaneObject::parse(&object, &hash)));
    }
    let Some(object) = repo.read_json(&incoming.hash)? else { return Ok(None) };
    let mut existing = LaneObject::parse(&object, &incoming.hash);
    existing.change_id(&incoming.scope, &incoming.name);
    Ok(Some(existing))
}

/// Visible entries, then hidden `updateDependents` as lane components.
fn entries(lane: &LaneObject) -> Vec<(LaneComponent, bool)> {
    let visible = lane.components
        .iter()
        .map(|component| (component.clone(), false));
    let hidden = lane.update_dependents
        .iter()
        .flatten()
        .filter_map(|id| {
            let head = id.version.clone()?;
            let component = LaneComponent {
                scope: id.scope.clone(),
                name: id.name.clone(),
                head,
                is_deleted: false,
            };
            Some((component, true))
        });
    visible.chain(hidden).collect()
}

/// `mergeLaneComponent` for one incoming entry.
fn merge_component(
    repo: &Repo,
    existing: &mut LaneObject,
    component: &LaneComponent,
    hidden: bool,
) -> io::Result<()> {
    if !repo.exists(&component_hash(&component.scope, &component.name)) {
        return Err(io::Error::other(format!(
            "unable to merge lane {}, the component {}/{} was not found",
            existing.name, component.scope, component.name,
        )));
    }
    let current = if hidden {
        existing.update_dependent(&component.scope, &component.name)
    } else {
        existing.component(&component.scope, &component.name).cloned()
    };
    let Some(current) = current else {
        require_version(repo, component, &component.head)?;
        add_to_bucket(existing, component, hidden);
        return Ok(());
    };
    if current.head == component.head {
        return Ok(());
    }
    if diverge(repo, component, &current.head)? == Divergence::TargetAhead {
        add_to_bucket(existing, component, hidden);
    }
    Ok(())
}

/// `addToBucket`: a hidden entry replaces a visible one and vice versa.
fn add_to_bucket(existing: &mut LaneObject, component: &LaneComponent, hidden: bool) {
    if hidden {
        existing.remove_component(&component.scope, &component.name);
        existing.add_update_dependent(Id {
            scope: component.scope.clone(),
            name: component.name.clone(),
            version: Some(component.head.clone()),
        });
    } else {
        existing.remove_update_dependent(&component.scope, &component.name);
        existing.add_component(component.clone());
    }
}

/// Hidden entries the origin dropped are pruned, matched by id (a local
/// pending cascade with a newer hash survives).
fn reconcile_hidden(existing: &mut LaneObject, incoming: &LaneObject) {
    let Some(current) = &existing.update_dependents else { return };
    if current.is_empty() {
        return;
    }
    let incoming_ids: HashSet<String> = incoming.update_dependents
        .iter()
        .flatten()
        .map(Id::without_version)
        .collect();
    let kept: Vec<Id> = current
        .iter()
        .filter(|id| incoming_ids.contains(&id.without_version()))
        .cloned()
        .collect();
    if kept.len() != current.len() {
        existing.update_dependents = (!kept.is_empty()).then_some(kept);
        existing.changed = true;
    }
}

/// `lanes.saveLane`: write the lane (and a history entry) only when it changed.
/// A remote lane the scope does not hold yet is not written: `Lane.parse`
/// leaves `hasChanged` off, so TypeScript skips it too.
fn save(repo: &Repo, lane: &LaneObject, save_history: bool, identity: &Identity) -> io::Result<()> {
    if !lane.changed {
        return Ok(());
    }
    repo.write_raw(&lane.hash, &compress_json("Lane", &lane.hash, &lane.to_object())?)?;
    repo.index_add(&[IndexRow::Lane {
        scope: lane.scope.clone(),
        name: lane.name.clone(),
        hash: lane.hash.clone(),
    }])?;
    if save_history {
        history::record(repo, lane, HISTORY_MESSAGE, identity)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Divergence {
    /// Only the incoming head has new snaps: fast-forward the local entry.
    TargetAhead,
    /// The local entry is ahead or the histories diverged: keep it.
    KeepLocal,
}

/// `getDivergeData` over the component's version parents. The incoming head
/// is the target and the local head the source.
fn diverge(repo: &Repo, component: &LaneComponent, source: &str) -> io::Result<Divergence> {
    let parents = Parents::load(repo, component)?;
    let source_closure = parents
        .closure(source)
        .ok_or_else(|| {
            io::Error::other(format!("local head {source} of {} was not found", id_of(component)))
        })?;
    let target_closure = parents
        .closure(&component.head)
        .ok_or_else(|| {
            io::Error::other(format!(
                "target head {} of {} was not found",
                component.head,
                id_of(component),
            ))
        })?;
    let source_only = source_closure
        .iter()
        .any(|hash| !target_closure.contains(hash));
    let target_only = target_closure
        .iter()
        .any(|hash| !source_closure.contains(hash));
    Ok(if target_only && !source_only { Divergence::TargetAhead } else { Divergence::KeepLocal })
}

/// `getAllVersionHashes` from `head` must be traversable: the head's Version
/// object exists locally (its history was fetched with it).
fn require_version(repo: &Repo, component: &LaneComponent, head: &str) -> io::Result<()> {
    if repo.exists(head) {
        return Ok(());
    }
    Err(io::Error::other(format!(
        "unable to merge lane entry {}: the snap {head} was not found locally",
        id_of(component),
    )))
}

fn id_of(component: &LaneComponent) -> String {
    format!("{}/{}", component.scope, component.name)
}

/// The parents graph of one component: its `VersionHistory`, completed from
/// Version objects for snaps the history does not list.
struct Parents<'a> {
    repo: &'a Repo,
    known: HashMap<String, Vec<String>>,
}

impl<'a> Parents<'a> {
    fn load(repo: &'a Repo, component: &LaneComponent) -> io::Result<Self> {
        let mut known = HashMap::new();
        let history = repo.read_json(&version_history_hash(&component.scope, &component.name))?;
        for version in history
            .as_ref()
            .and_then(|history| history["versions"].as_array())
            .into_iter()
            .flatten()
        {
            if let Some(hash) = version["hash"].as_str() {
                known.insert(hash.to_string(), hashes(&version["parents"]));
            }
        }
        Ok(Self { repo, known })
    }

    /// Every snap reachable from `head` through parents, or `None` when the
    /// head itself is unknown.
    fn closure(&self, head: &str) -> Option<HashSet<String>> {
        let mut seen = HashSet::new();
        let mut queue = VecDeque::from([head.to_string()]);
        while let Some(hash) = queue.pop_front() {
            if !seen.insert(hash.clone()) {
                continue;
            }
            let parents = match self.known.get(&hash) {
                Some(parents) => parents.clone(),
                None => self.parents_of_version(&hash)?,
            };
            queue.extend(parents);
        }
        Some(seen)
    }

    fn parents_of_version(&self, hash: &str) -> Option<Vec<String>> {
        let version = self.repo.read_json(hash).ok()??;
        Some(hashes(&version["parents"]))
    }
}

fn hashes(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|hash| hash.as_str().map(str::to_string))
        .collect()
}

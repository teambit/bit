//! The workspace's current remote lane (`workspace.getCurrentRemoteLane()` and
//! `ScopeComponentsImporter.importLanes`), and its merge into the local lane.

pub(crate) mod object;

pub use history::Identity;
pub use merge::merge_and_save;

mod history;
mod merge;

use super::{
    bitmap::{Id, LaneId},
    fetch::{FetchOptions, Fetcher},
    objects::{RemoteRef, Repo, parse},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::io;

/// A lane object fetched from its remote.
#[derive(Debug, Clone, PartialEq)]
pub struct RemoteLane {
    pub id: LaneId,
    pub hash: String,
    pub compressed: Vec<u8>,
    pub object: Value,
}

impl RemoteLane {
    /// Visible lane components at their lane heads.
    #[must_use]
    pub fn components(&self) -> Vec<Id> {
        self.object["components"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let mut id = super::fs_remote::dependency_id(entry)?;
                id.version = entry["head"].as_str().map(str::to_string);
                Some(id)
            })
            .collect()
    }

    /// `toComponentIdsIncludeUpdateDependents()`.
    #[must_use]
    pub fn ids_with_update_dependents(&self) -> Vec<Id> {
        let hidden = self.object["updateDependents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(super::fs_remote::dependency_id);
        self.components()
            .into_iter()
            .chain(hidden)
            .collect()
    }

    /// Whether the lane lists the component (`groupByLanes`).
    #[must_use]
    pub fn contains(&self, id: &Id) -> bool {
        self.ids_with_update_dependents()
            .iter()
            .any(|lane_id| lane_id.scope == id.scope && lane_id.name == id.name)
    }
}

/// `updateDependents` of the lane object stored in the local scope
/// (`workspace.getCurrentLaneObject()`): the dependents Ripple CI cascaded onto
/// the lane, which version resolution prefers over the model. Main has no lane
/// object; a lane the scope does not hold yet has no dependents.
pub fn local_update_dependents(repo: &Repo, lane: &LaneId) -> io::Result<Vec<Id>> {
    let Some(hash) = repo.lane_hash(&lane.scope, &lane.name)? else { return Ok(Vec::new()) };
    let Some(object) = repo.read_json(&hash)? else { return Ok(Vec::new()) };
    Ok(object["updateDependents"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(super::fs_remote::dependency_id)
        .collect())
}

/// Fetch the lane `.bitmap` points at. A lane that was never exported may not
/// exist on its remote; that is not an error.
pub async fn fetch_remote_lane(
    fetcher: &Fetcher<'_>,
    lane: &LaneId,
) -> io::Result<Option<RemoteLane>> {
    let grouped = IndexMap::from([(lane.scope.clone(), vec![lane.to_request()])]);
    let fetched = match fetcher.fetch(&grouped, &FetchOptions::lanes()).await {
        Ok(fetched) => fetched,
        Err(error) if error.kind() == io::ErrorKind::NotFound && !lane.exported => return Ok(None),
        Err(error) => return Err(error),
    };
    for item in fetched.into_values().flatten() {
        let parsed = parse(&item.compressed)?;
        if parsed.kind == "Lane" {
            let object = parsed.json()?;
            return Ok(Some(RemoteLane {
                id: lane.clone(),
                hash: item.hash,
                compressed: item.compressed,
                object,
            }));
        }
    }
    Ok(None)
}

/// `RemoteLanes.syncWithLaneObject`: record the lane heads under `refs/remotes`.
pub fn sync_remote_refs(repo: &Repo, lane: &RemoteLane) -> io::Result<()> {
    let refs: Vec<RemoteRef> = lane
        .ids_with_update_dependents()
        .into_iter()
        .filter_map(|id| Some(RemoteRef { head: id.version?, scope: id.scope, name: id.name }))
        .collect();
    repo.add_remote_refs(&lane.id.scope, &lane.id.name, &refs)
}

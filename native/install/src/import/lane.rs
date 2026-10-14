//! The workspace's current remote lane (`workspace.getCurrentRemoteLane()` and
//! `ScopeComponentsImporter.importLanes`).

use super::{
    bitmap::{Id, LaneId},
    fetch::{FetchOptions, Fetcher},
    objects::{IndexRow, RemoteRef, Repo, parse},
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
                Some(Id {
                    scope: entry["id"]["scope"].as_str()?.to_string(),
                    name: entry["id"]["name"].as_str()?.to_string(),
                    version: entry["head"].as_str().map(str::to_string),
                })
            })
            .collect()
    }

    /// `toComponentIdsIncludeUpdateDependents()`.
    #[must_use]
    pub fn ids_with_update_dependents(&self) -> Vec<Id> {
        let hidden = self.object["updateDependents"]
            .as_array()
            .into_iter()
            .flatten();
        let hidden = hidden.filter_map(|id| Id::parse(id.as_str()?).ok());
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

/// Store the remote lane object when the scope has none yet. A local lane
/// object that already exists is kept as is.
pub fn save_lane_if_missing(repo: &Repo, lane: &RemoteLane) -> io::Result<()> {
    if repo.exists(&lane.hash) {
        return Ok(());
    }
    repo.write_raw(&lane.hash, &lane.compressed)?;
    repo.index_add(&[IndexRow::Lane {
        scope: lane.id.scope.clone(),
        name: lane.id.name.clone(),
        hash: lane.hash.clone(),
    }])
}

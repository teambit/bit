//! The workspace's current remote lane (`workspace.getCurrentRemoteLane()` and
//! `ScopeComponentsImporter.importLanes`), and its merge into the local lane.
//!
//! Fetch remote lane objects ([`RemoteLane`]), extract visible component heads, and update local lane state via [`merge_and_save`].

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

/// Fetched remote lane object with its [`LaneId`], SHA-1 hash, compressed payload, and parsed JSON [`Value`].
#[derive(Debug, Clone, PartialEq)]
pub struct RemoteLane {
    /// Remote lane scope and name identifier.
    pub id: LaneId,
    /// SHA-1 object hash of the lane object.
    pub hash: String,
    /// Raw zlib-compressed loose object bytes for the lane.
    pub compressed: Vec<u8>,
    /// Parsed JSON representation of the remote lane object.
    pub object: Value,
}

impl RemoteLane {
    /// Visible lane components at their lane heads as [`Id`] items.
    #[must_use]
    #[inline]
    pub fn components(&self) -> Vec<Id> {
        self.object["components"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let mut id = super::fs_remote::dependency_id(entry)?;
                id.version = entry["head"]
                    .as_str()
                    .map(str::trim)
                    .filter(|head| !head.is_empty())
                    .map(str::to_string);
                Some(id)
            })
            .collect()
    }

    /// Visible and `updateDependents` lane [`Id`] items (`toComponentIdsIncludeUpdateDependents()`).
    #[must_use]
    #[inline]
    pub fn ids_with_update_dependents(&self) -> Vec<Id> {
        let mut ids = self.components();
        for dep in self.object["updateDependents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(super::fs_remote::dependency_id)
        {
            if !ids
                .iter()
                .any(|existing| {
                    existing.scope.trim() == dep.scope.trim()
                        && existing.name.trim() == dep.name.trim()
                })
            {
                ids.push(dep);
            }
        }
        ids
    }

    /// Whether this [`RemoteLane`] lists the component [`Id`] (`groupByLanes`).
    #[must_use]
    #[inline]
    pub fn contains(&self, id: &Id) -> bool {
        let (scope, name) = (id.scope.trim(), id.name.trim());
        ["components", "updateDependents"]
            .into_iter()
            .filter_map(|field| self.object[field].as_array())
            .flatten()
            .filter_map(super::fs_remote::dependency_id)
            .any(|lane_id| lane_id.scope.trim() == scope && lane_id.name.trim() == name)
    }
}

/// `updateDependents` of the lane object stored in the local scope
/// (`workspace.getCurrentLaneObject()`): the dependents Ripple CI cascaded onto
/// the lane, which version resolution prefers over the model. Main has no lane
/// object; a lane the scope does not hold yet has no dependents.
pub fn local_update_dependents(repo: &Repo, lane: &LaneId) -> io::Result<Vec<Id>> {
    let Some(hash) = repo.lane_hash(lane.scope.trim(), lane.name.trim())? else {
        return Ok(Vec::new());
    };
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
    let scope = lane.scope.trim();
    if scope.is_empty() || lane.name.trim().is_empty() {
        return Ok(None);
    }
    let grouped = IndexMap::from([(scope.to_owned(), vec![lane.to_request()])]);
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
#[inline]
pub fn sync_remote_refs(repo: &Repo, lane: &RemoteLane) -> io::Result<()> {
    let refs: Vec<RemoteRef> = lane
        .ids_with_update_dependents()
        .into_iter()
        .filter_map(|id| {
            let head = id.version
                .as_deref()
                .map(str::trim)
                .filter(|head| !head.is_empty())?
                .to_owned();
            Some(RemoteRef { head, scope: id.scope, name: id.name })
        })
        .collect();
    repo.add_remote_refs(&lane.id.scope, &lane.id.name, &refs)
}

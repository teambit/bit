//! Capture remote Lane metadata and its graph-selected component closure.
//!
//! Fetches lane [`Record`]s at explicit or head hashes and stages component closures into [`PreparedImport`].
use super::{
    Id, PreparedImport, Record, Target, entries, invalid, receive_closure, receive_prefer_graph,
    remote, remote_lane_hash,
};
use crate::command_import::{Progress, lane::validate_value};
use std::{collections::HashSet, io};

impl PreparedImport {
    /// Read the raw remote `Lane` object at `hash` from `scope` when `scope` is a known remote.
    pub(in crate::command_import) fn lane_wire_object(
        &mut self,
        scope: &str,
        hash: &str,
    ) -> io::Result<Option<crate::command_import::capture::Object>> {
        let scope = scope.trim();
        let hash = hash.trim();
        if !self.environment.remote_overrides.contains_key(scope)
            && self.environment.remotes.get(scope).is_none()
        {
            return Ok(None);
        }
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, scope)?;
        self.capture.object(&directory, hash, "Lane")
    }
    /// Fetch the remote [`Record`] for `id` (at `supplied_hash` or head) and its full component closure.
    #[inline]
    pub(crate) fn fetch_lane_contents_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, false, false)
    }
    /// Fetch the remote [`Record`] for workspace lane checkout, optionally skipping unchanged heads (`delta`).
    #[inline]
    pub(crate) fn fetch_lane_workspace_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
        delta: bool,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, false, delta)
    }
    /// Fetch the remote [`Record`] for `id` (at `supplied_hash` or head) preferring the dependency graph closure.
    #[inline]
    pub(crate) fn fetch_lane_components_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, true, false)
    }
    fn fetch_lane_with_policy(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
        prefer_graph: bool,
        delta: bool,
    ) -> io::Result<Record> {
        id.validate()?;
        let lane_scope = id.scope.trim();
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, lane_scope)?;
        let hash = lane_hash(self, &directory, id, supplied_hash)?;
        let value = self.capture
            .object(&directory, &hash, "Lane")?
            .ok_or_else(|| invalid("remote Lane missing"))?
            .value
            .ok_or_else(|| invalid("remote Lane body"))?;
        validate_value(id, &value)?;
        self.progress.push(Progress {
            reason: Some(format!("for fetching lane {lane_scope}/{}", id.name.trim())),
            objects: HashSet::from([super::super::object_hash(lane_scope)]),
            ..Default::default()
        });
        let lane_entries = entries(&value)?;
        let mut visited = HashSet::with_capacity(lane_entries.len());
        for entry in lane_entries {
            if delta && locally_at_remote_head(self, id, &entry)? {
                continue;
            }
            let (scope, name) =
                entry.identity.split_once('/').ok_or_else(|| invalid("lane component scope"))?;
            let target = Target {
                scope: Some(scope.trim().into()),
                name: name.trim().into(),
                version: entry.head.trim().into(),
            };
            if prefer_graph {
                receive_prefer_graph(self, &directory, lane_scope, &target, &mut visited)?;
            } else {
                receive_closure(self, &directory, lane_scope, &target, &mut visited)?;
            }
        }
        Ok(Record { hash, value, is_new: false })
    }
}

#[inline]
fn lane_hash(
    plan: &mut PreparedImport,
    directory: &std::path::Path,
    id: &Id,
    supplied_hash: Option<&str>,
) -> io::Result<String> {
    if let Some(hash) = supplied_hash
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
    {
        crate::merge_history::hash(hash)?;
        Ok(hash.to_owned())
    } else {
        remote_lane_hash(plan, directory, id)
    }
}

fn locally_at_remote_head(
    plan: &mut PreparedImport,
    lane: &Id,
    entry: &crate::command_import::lane::Entry,
) -> io::Result<bool> {
    let (scope, name) =
        entry.identity.split_once('/').ok_or_else(|| invalid("lane component scope"))?;
    let (scope, name, head) = (scope.trim(), name.trim(), entry.head.trim());
    let refs = plan.environment.local_directory
        .parent()
        .ok_or_else(|| invalid("lane local scope"))?
        .join("refs/remotes")
        .join(scope)
        .join(lane.name.trim());
    let rows = plan.capture
        .json(&refs)?
        .unwrap_or_else(|| serde_json::json!([]));
    let rows = rows.as_array().ok_or_else(|| invalid("lane remote refs"))?;
    let unchanged = rows
        .iter()
        .any(|row| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                row, scope, name,
            ) && row["head"].as_str().map(str::trim) == Some(head)
        });
    Ok(unchanged && super::super::read_version(plan, head)?.is_some())
}

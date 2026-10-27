//! Capture remote Lane metadata and its graph-selected component closure.
use super::{
    Id, PreparedImport, Record, Target, entries, invalid, receive_closure, receive_prefer_graph,
    remote, remote_lane_hash,
};
use crate::command_import::{Progress, lane::validate_value};
use std::{collections::HashSet, io};

impl PreparedImport {
    pub(in crate::command_import) fn lane_wire_object(
        &mut self,
        scope: &str,
        hash: &str,
    ) -> io::Result<Option<crate::command_import::capture::Object>> {
        if !self.environment.remote_overrides.contains_key(scope)
            && self.environment.remotes.get(scope).is_none()
        {
            return Ok(None);
        }
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, scope)?;
        self.capture.object(&directory, hash, "Lane")
    }
    pub(crate) fn fetch_lane_contents_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, false, false)
    }
    pub(crate) fn fetch_lane_workspace_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
        delta: bool,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, false, delta)
    }
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
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, &id.scope)?;
        let hash = lane_hash(self, &directory, id, supplied_hash)?;
        let record = self.capture
            .object(&directory, &hash, "Lane")?
            .ok_or_else(|| invalid("remote Lane missing"))?;
        let value = record.value
            .as_ref()
            .ok_or_else(|| invalid("remote Lane body"))?
            .clone();
        validate_value(id, &value)?;
        self.progress.push(Progress {
            reason: Some(format!("for fetching lane {}/{}", id.scope, id.name)),
            ..Default::default()
        });
        self.progress
            .last_mut()
            .unwrap()
            .objects
            .insert(super::super::object_hash(&id.scope));
        let mut visited = HashSet::new();
        for entry in entries(&value)? {
            if delta && locally_at_remote_head(self, id, &entry)? {
                continue;
            }
            let (scope, name) =
                entry.identity.split_once('/').ok_or_else(|| invalid("lane component scope"))?;
            let target =
                Target { scope: Some(scope.into()), name: name.into(), version: entry.head };
            if prefer_graph {
                receive_prefer_graph(self, &directory, &id.scope, &target, &mut visited)?;
            } else {
                receive_closure(self, &directory, &id.scope, &target, &mut visited)?;
            }
        }
        Ok(Record { hash, value, is_new: false })
    }
}

fn lane_hash(
    plan: &mut PreparedImport,
    directory: &std::path::Path,
    id: &Id,
    supplied_hash: Option<&str>,
) -> io::Result<String> {
    if let Some(hash) = supplied_hash {
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
    let refs = plan.environment.local_directory
        .parent()
        .ok_or_else(|| invalid("lane local scope"))?
        .join("refs/remotes")
        .join(scope)
        .join(&lane.name);
    let rows = plan.capture
        .json(&refs)?
        .unwrap_or_else(|| serde_json::json!([]));
    let rows = rows.as_array().ok_or_else(|| invalid("lane remote refs"))?;
    let unchanged = rows
        .iter()
        .any(|row| {
            row["id"]["scope"] == scope && row["id"]["name"] == name && row["head"] == entry.head
        });
    Ok(unchanged && super::super::read_version(plan, &entry.head)?.is_some())
}

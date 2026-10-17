//! Capture remote Lane metadata and its graph-selected component closure.
use super::{
    Id, PreparedImport, Record, Target, entries, invalid, receive_closure, receive_prefer_graph,
    remote, remote_lane_hash,
};
use crate::command_import::{Progress, lane::validate_value};
use std::{collections::HashSet, io};

impl PreparedImport {
    pub(crate) fn fetch_lane_contents_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, false)
    }
    pub(crate) fn fetch_lane_components_at_hash(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
    ) -> io::Result<Record> {
        self.fetch_lane_with_policy(id, supplied_hash, true)
    }
    fn fetch_lane_with_policy(
        &mut self,
        id: &Id,
        supplied_hash: Option<&str>,
        prefer_graph: bool,
    ) -> io::Result<Record> {
        id.validate()?;
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, &id.scope)?;
        let hash = if let Some(hash) = supplied_hash {
            crate::merge_history::hash(hash)?;
            hash.to_owned()
        } else {
            remote_lane_hash(self, &directory, id)?
        };
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
            let (scope, name) =
                entry.identity.split_once('/').ok_or_else(|| invalid("lane component scope"))?;
            let target =
                Target { scope: Some(scope.into()), name: name.into(), version: entry.head };
            if prefer_graph {
                receive_prefer_graph(self, &directory, &target, &mut visited)?;
            } else {
                receive_closure(self, &directory, &target, &mut visited)?;
            }
        }
        Ok(Record { hash, value, is_new: false })
    }
}

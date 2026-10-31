//! `importLanes(includeLaneHistory: true)` merges persisted history only.
#[cfg(test)]
mod tests;
use super::{Id, PreparedImport, Record, invalid, remote_lane_hash};
use crate::command_import::{lane::validate_value, publish};
use serde_json::Value;
use std::io;

impl PreparedImport {
    pub(crate) fn refresh_lane_history(
        &mut self,
        local: &Record,
        id: &Id,
        hash: Option<&str>,
    ) -> io::Result<()> {
        let remotes = self.environment.remotes.clone();
        let directory = super::super::remote::raw_remote(self, &remotes, &id.scope)?;
        let hash = match hash
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
        {
            Some(hash) => hash.to_owned(),
            None => remote_lane_hash(self, &directory, id)?,
        };
        if hash != local.hash {
            return Err(invalid("remote lane history stable identity changed"));
        }
        let incoming = self.capture
            .object(&directory, &hash, "Lane")?
            .and_then(|object| object.value)
            .ok_or_else(|| invalid("remote lane history Lane missing"))?;
        validate_value(id, &incoming)?;
        self.merge_remote_history(&directory, &hash)?;
        self.validate()
    }
    fn merge_remote_history(&mut self, directory: &std::path::Path, hash: &str) -> io::Result<()> {
        let history_hash = crate::lane_history::hash(hash);
        let incoming = self.capture.object(directory, &history_hash, "LaneHistory")?;
        let Some(incoming) = incoming else { return Ok(()) };
        let existing = self.capture.object(
            &self.environment.local_directory.clone(),
            &history_hash,
            "LaneHistory",
        )?;
        let value = merge_history(
            existing.as_ref().and_then(|record| record.value.clone()),
            incoming.value.clone().ok_or_else(|| invalid("remote LaneHistory body"))?,
            hash,
        )?;
        self.overlay.objects.insert(
            history_hash.clone(),
            publish::reusing_candidates(
                &history_hash,
                "LaneHistory",
                value,
                existing
                    .into_iter()
                    .chain(std::iter::once(incoming)),
            )?,
        );
        Ok(())
    }
}

fn merge_history(existing: Option<Value>, incoming: Value, lane_hash: &str) -> io::Result<Value> {
    if incoming["laneHash"] != lane_hash {
        return Err(invalid("remote LaneHistory identity"));
    }
    let incoming_rows =
        incoming["history"].as_object().ok_or_else(|| invalid("remote LaneHistory entries"))?;
    if incoming_rows.len() > 4096 {
        return Err(invalid("remote LaneHistory entry budget"));
    }
    let Some(mut existing) = existing else { return Ok(incoming) };
    if existing["laneHash"] != lane_hash {
        return Err(invalid("local LaneHistory identity"));
    }
    let rows =
        existing["history"].as_object_mut().ok_or_else(|| invalid("local LaneHistory entries"))?;
    for (key, value) in incoming_rows {
        rows.insert(key.clone(), value.clone());
        if rows.len() > 4096 {
            return Err(invalid("merged LaneHistory entry budget"));
        }
    }
    Ok(existing)
}

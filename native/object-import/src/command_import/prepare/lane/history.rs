//! `importLanes(includeLaneHistory: true)` merges persisted history only.
//!
//! Refreshes and merges remote `LaneHistory` [`Record`]s into the [`PreparedImport`] scope overlay.
#[cfg(test)]
mod tests;
use super::{Id, PreparedImport, Record, invalid, remote_lane_hash};
use crate::command_import::{lane::validate_value, publish};
use serde_json::Value;
use std::io;

impl PreparedImport {
    /// Refresh and merge the remote `LaneHistory` object for `id` into the prepared import overlay.
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
            Some(hash) => {
                crate::merge_history::hash(hash)?;
                hash.to_owned()
            }
            None => remote_lane_hash(self, &directory, id)?,
        };
        if hash != local.hash.trim() {
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
    /// Merge the remote `LaneHistory` object for `hash` from `directory` into the prepared overlay.
    #[inline]
    fn merge_remote_history(&mut self, directory: &std::path::Path, hash: &str) -> io::Result<()> {
        let history_hash = crate::lane_history::hash(hash);
        let Some(incoming) = self.capture.object(directory, &history_hash, "LaneHistory")? else {
            return Ok(());
        };
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

#[inline]
fn merge_history(
    existing: Option<Value>,
    mut incoming: Value,
    lane_hash: &str,
) -> io::Result<Value> {
    let lane_hash = lane_hash.trim();
    if incoming["laneHash"].as_str().map(str::trim) != Some(lane_hash) {
        return Err(invalid("remote LaneHistory identity"));
    }
    let incoming_rows =
        incoming["history"].as_object().ok_or_else(|| invalid("remote LaneHistory entries"))?;
    if incoming_rows.len() > 4096 {
        return Err(invalid("remote LaneHistory entry budget"));
    }
    if incoming_rows
        .iter()
        .any(|(key, value)| key.trim().is_empty() || !value.is_object())
    {
        return Err(invalid("remote LaneHistory entry shape"));
    }
    let Some(mut existing) = existing else { return Ok(incoming) };
    if existing["laneHash"].as_str().map(str::trim) != Some(lane_hash) {
        return Err(invalid("local LaneHistory identity"));
    }
    let incoming_rows =
        incoming["history"].as_object_mut().ok_or_else(|| invalid("remote LaneHistory entries"))?;
    let rows =
        existing["history"].as_object_mut().ok_or_else(|| invalid("local LaneHistory entries"))?;
    for (key, value) in std::mem::take(incoming_rows) {
        rows.insert(key.trim().to_owned(), value);
        if rows.len() > 4096 {
            return Err(invalid("merged LaneHistory entry budget"));
        }
    }
    Ok(existing)
}

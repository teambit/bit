//! Pending `VersionHistory` and `LaneHistory` reconciliation during reset.

use super::{ObjectChange, Repository, changed, invalid, object_hash, outbound};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) fn version_history(repository: &Repository, identity: &str) -> io::Result<ObjectChange> {
    project_history(&repository.objects, identity, &repository.current)
}

fn project_history(objects: &Path, identity: &str, current: &str) -> io::Result<ObjectChange> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("lane history identity"))?;
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let mut history = outbound::read_object(objects, &hash, "VersionHistory")?;
    if history["scope"] != scope || history["name"] != name {
        return Err(invalid("lane reset VersionHistory identity"));
    }
    let versions = history["versions"]
        .as_array_mut()
        .ok_or_else(|| invalid("lane reset VersionHistory versions"))?;
    if !versions
        .iter()
        .any(|row| row["hash"] == current)
    {
        let version = outbound::read_object(objects, current, "Version")?;
        versions.push(json!({"hash":current,"parents":version["parents"]}));
    }
    changed(objects, &hash, "VersionHistory", &history)
}

pub(super) fn pending_histories(
    objects: &Path,
    lane: &Value,
    selected: &HashSet<String>,
) -> io::Result<Vec<ObjectChange>> {
    let rows = lane["components"].as_array().ok_or_else(|| invalid("lane pending components"))?;
    let mut changes = Vec::new();
    for row in rows {
        if let Some(change) = pending_history(objects, row, selected)? {
            changes.push(change);
        }
    }
    Ok(changes)
}

fn pending_history(
    objects: &Path,
    row: &Value,
    selected: &HashSet<String>,
) -> io::Result<Option<ObjectChange>> {
    let scope = row["id"]["scope"].as_str().ok_or_else(|| invalid("lane pending scope"))?;
    let name = row["id"]["name"].as_str().ok_or_else(|| invalid("lane pending name"))?;
    let identity = format!("{scope}/{name}");
    if selected.contains(&identity) {
        return Ok(None);
    }
    let current = row["head"].as_str().ok_or_else(|| invalid("lane pending head"))?;
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let history = outbound::read_object(objects, &hash, "VersionHistory")?;
    let versions =
        history["versions"].as_array().ok_or_else(|| invalid("lane pending versions"))?;
    if versions
        .iter()
        .any(|entry| entry["hash"] == current)
    {
        return Ok(None);
    }
    project_history(objects, &identity, current).map(Some)
}

pub(super) fn lane_history(
    repository: &Repository,
    removed: &[String],
) -> io::Result<ObjectChange> {
    let hash = object_hash(&format!("{}:LaneHistory", repository.lane_hash));
    let mut history = outbound::read_object(&repository.objects, &hash, "LaneHistory")?;
    if history["laneHash"] != repository.lane_hash
        || history["scope"] != repository.lane_scope
        || history["name"] != repository.lane_name
    {
        return Err(invalid("lane reset LaneHistory identity"));
    }
    let batches = batch_ids(&repository.objects, removed)?;
    let entries =
        history["history"].as_object_mut().ok_or_else(|| invalid("lane reset history entries"))?;
    for batch in batches {
        if entries.shift_remove(&batch).is_none() {
            return Err(invalid("lane reset history batch absent"));
        }
    }
    changed(&repository.objects, &hash, "LaneHistory", &history)
}

pub(super) fn batch_ids(objects: &Path, removed: &[String]) -> io::Result<HashSet<String>> {
    removed
        .iter()
        .map(|hash| {
            let version = outbound::read_object(objects, hash, "Version")?;
            version["batchId"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("lane reset batch id"))
        })
        .collect()
}

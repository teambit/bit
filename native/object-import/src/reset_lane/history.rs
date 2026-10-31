//! Pending `VersionHistory` and `LaneHistory` reconciliation during reset.

use super::{ObjectChange, Repository, changed, invalid, object_hash, outbound};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) fn version_history(repository: &Repository, identity: &str) -> io::Result<ObjectChange> {
    project_history(&repository.objects, identity, &repository.heads.current)
}

fn project_history(objects: &Path, identity: &str, current: &str) -> io::Result<ObjectChange> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("lane history identity"))?;
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let (mut history, new) = match outbound::read_object(objects, &hash, "VersionHistory") {
        Ok(history) => (history, false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            (json!({"name":name,"scope":scope,"versions":[],"graphCompleteRefs":[]}), true)
        }
        Err(error) => return Err(error),
    };
    if history["scope"] != scope || history["name"] != name {
        return Err(invalid("lane reset VersionHistory identity"));
    }
    let versions = history["versions"]
        .as_array_mut()
        .ok_or_else(|| invalid("lane reset VersionHistory versions"))?;
    append_missing_ancestors(objects, versions, current)?;
    if new {
        Ok(ObjectChange {
            hash: hash.clone(),
            before: Vec::new(),
            after: Some(outbound::encode_object(&hash, "VersionHistory", &history)?),
        })
    } else {
        changed(objects, &hash, "VersionHistory", &history)
    }
}

fn append_missing_ancestors(
    objects: &Path,
    versions: &mut Vec<Value>,
    current: &str,
) -> io::Result<()> {
    let mut pending = vec![current.to_owned()];
    let mut seen = HashSet::new();
    while let Some(current) = pending.pop() {
        if versions
            .iter()
            .any(|entry| entry["hash"] == current)
        {
            continue;
        }
        if !seen.insert(current.clone()) || seen.len() > 4096 {
            return Err(invalid("lane reset VersionHistory cycle or limit"));
        }
        let version = outbound::read_object(objects, &current, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("lane history parents"))?;
        versions.push(parent_entry(&current, &version, parents));
        for parent in parents.iter().rev() {
            let parent = parent.as_str().ok_or_else(|| invalid("lane history parent"))?;
            crate::merge_history::hash(parent)?;
            pending.push(parent.to_owned());
        }
    }
    Ok(())
}

fn parent_entry(hash: &str, version: &Value, parents: &[Value]) -> Value {
    let mut entry = json!({"hash":hash,"parents":parents});
    if let Some(unrelated) = version["unrelated"]["head"].as_str() {
        entry["unrelated"] = json!(unrelated);
    }
    if let Some(squashed) = version["squashed"]["previousParents"].as_array() {
        entry["squashed"] = json!(squashed);
    }
    entry
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
    let (scope_opt, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .ok_or_else(|| invalid("lane pending name"))?;
    let scope = scope_opt
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("lane pending scope"))?;
    let identity = format!("{scope}/{name}");
    if selected.contains(&identity) {
        return Ok(None);
    }
    let current = row["head"].as_str().ok_or_else(|| invalid("lane pending head"))?;
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let history = match outbound::read_object(objects, &hash, "VersionHistory") {
        Ok(history) => history,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return project_history(objects, &identity, current).map(Some);
        }
        Err(error) => return Err(error),
    };
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
        entries.shift_remove(&batch);
    }
    changed(&repository.objects, &hash, "LaneHistory", &history)
}

pub(super) fn batch_ids(objects: &Path, removed: &[String]) -> io::Result<HashSet<String>> {
    removed
        .iter()
        .map(|hash| {
            let version = outbound::read_object(objects, hash, "Version")?;
            Ok(version["batchId"].as_str().map(str::to_owned))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.into_iter().flatten().collect())
}

/// `VersionHistory` retains graph edges even when lean imports omit ancestor Version bodies.
pub(super) fn records(repository: &Repository, heads: &[String]) -> io::Result<Value> {
    let identity = format!(
        "{}/{}",
        repository.model["scope"].as_str().unwrap_or_default(),
        repository.model["name"].as_str().unwrap_or_default(),
    );
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let mut versions = match outbound::read_object(&repository.objects, &hash, "VersionHistory") {
        Ok(history) => history["versions"]
            .as_array()
            .ok_or_else(|| invalid("lane reset graph cache"))?
            .clone(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error),
    };
    for head in heads {
        append_missing_ancestors(&repository.objects, &mut versions, head)?;
    }
    Ok(Value::Array(versions))
}

/// Node persists each successful missing-head population immediately, before reset validation.
pub(super) fn populations(repository: &Repository) -> io::Result<Vec<ObjectChange>> {
    let mut heads = vec![repository.heads.current.clone()];
    heads.extend(repository.heads.baseline.iter().cloned());
    if repository.model["detachedHeads"]["heads"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
    {
        heads.extend(repository.model["head"].as_str().map(str::to_owned));
    }
    populations_for(repository, &heads)
}

pub(super) fn populations_for(
    repository: &Repository,
    heads: &[String],
) -> io::Result<Vec<ObjectChange>> {
    let identity = format!(
        "{}/{}",
        repository.model["scope"].as_str().unwrap_or_default(),
        repository.model["name"].as_str().unwrap_or_default(),
    );
    let hash = object_hash(&format!("{identity}:VersionHistory"));
    let path = super::object_path(&repository.objects, &hash);
    let mut before = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error),
    };
    let mut history = if before.is_empty() {
        json!({"name":repository.model["name"],"scope":repository.model["scope"],"versions":[],"graphCompleteRefs":[]})
    } else {
        outbound::read_object(&repository.objects, &hash, "VersionHistory")?
    };
    let mut changes = Vec::new();
    for head in heads {
        let previous = history.clone();
        let versions = history["versions"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane reset population versions"))?;
        append_missing_ancestors(&repository.objects, versions, head)?;
        if previous != history {
            let after = outbound::encode_object(&hash, "VersionHistory", &history)?;
            changes.push(ObjectChange { hash: hash.clone(), before, after: Some(after.clone()) });
            before = after;
        }
    }
    Ok(changes)
}

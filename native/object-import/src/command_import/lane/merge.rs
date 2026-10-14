use super::{Entry, PreparedImport, Record, entries, invalid};
use crate::command_import::{history, publish};
use serde_json::{Value, json};
use std::io;

#[cfg(test)]
mod tests;

pub(super) fn merge(
    plan: &mut PreparedImport,
    old: Option<&Record>,
    incoming: &Record,
) -> io::Result<Record> {
    if old.is_some_and(|old| old.hash != incoming.hash) {
        return Err(invalid("remote Lane stable hash mismatch"));
    }
    let mut merged = old.cloned().unwrap_or_else(|| incoming.clone());
    let mut changed = old.is_none();
    if merged.value["scope"] != incoming.value["scope"]
        || merged.value["name"] != incoming.value["name"]
    {
        merged.value["scope"] = incoming.value["scope"].clone();
        merged.value["name"] = incoming.value["name"].clone();
        changed = true;
    }
    for entry in entries(&incoming.value)? {
        let replace = should_replace(plan, &merged.value, &entry)?;
        if replace {
            replace_entry(&mut merged.value, &incoming.value, &entry)?;
            changed = true;
        }
    }
    changed |= prune_hidden(&mut merged.value, &incoming.value)?;
    if merged.value.get("overrideUpdateDependents").is_some() {
        merged.value
            .as_object_mut()
            .unwrap()
            .remove("overrideUpdateDependents");
        changed = true;
    }
    if changed {
        stage_changed(plan, &mut merged, incoming)?;
    }
    remote_refs(plan, incoming)?;
    Ok(merged)
}

fn ahead(
    plan: &mut PreparedImport,
    identity: &str,
    current: &str,
    incoming: &str,
) -> io::Result<bool> {
    let hash = history::identity(identity);
    let model = plan.lane_model(identity)?.ok_or_else(|| invalid("lane merge model missing"))?;
    let mut history_value = if let Some(value) = plan.overlay.read(&hash, "VersionHistory")? {
        value.clone()
    } else {
        plan.capture.object(&plan.environment.local_directory, &hash, "VersionHistory")?
            .and_then(|object| object.value).unwrap_or_else(|| json!({"name":model["name"],"scope":model["scope"],"versions":[],"graphCompleteRefs":[]}))
    };
    extend_local_history(plan, &hash, &model, current, &mut history_value)?;
    let distance = crate::merge_history::status::distance(
        &history_value["versions"],
        Some(current),
        Some(incoming),
    )?;
    if distance["noCommon"] == true {
        return Err(invalid("lane import unrelated history"));
    }
    Ok(distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
        && distance["targetOnly"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty()))
}

fn replace_entry(value: &mut Value, incoming: &Value, entry: &Entry) -> io::Result<()> {
    let visible = value["components"].as_array_mut().ok_or_else(|| invalid("lane components"))?;
    let (scope, name) =
        entry.identity.split_once('/').ok_or_else(|| invalid("lane component scope"))?;
    if entry.hidden {
        visible.retain(|row| !(row["id"]["scope"] == scope && row["id"]["name"] == name));
    } else {
        let replacement = incoming["components"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
            })
            .ok_or_else(|| invalid("lane incoming component"))?
            .clone();
        if let Some(row) = visible
            .iter_mut()
            .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        {
            *row = replacement;
        } else {
            visible.push(replacement);
        }
    }
    replace_hidden(value, entry);
    Ok(())
}
fn replace_hidden(value: &mut Value, entry: &Entry) {
    let mut hidden = value
        .get("updateDependents")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let old_index = hidden
        .iter()
        .position(|row| {
            row.as_str()
                .and_then(|id| id.rsplit_once('@'))
                .is_some_and(|(id, _)| id == entry.identity)
        });
    if entry.hidden {
        let id = json!(format!("{}@{}", entry.identity, entry.head));
        if let Some(index) = old_index {
            hidden.remove(index);
        }
        hidden.push(id);
    } else if let Some(index) = old_index {
        hidden.remove(index);
    }
    set_hidden(value, hidden);
}
fn prune_hidden(value: &mut Value, incoming: &Value) -> io::Result<bool> {
    let incoming = entries(incoming)?
        .into_iter()
        .filter(|row| row.hidden)
        .map(|row| row.identity)
        .collect::<Vec<_>>();
    let Some(rows) = value.get("updateDependents").and_then(Value::as_array) else {
        return Ok(false);
    };
    let retained = rows
        .iter()
        .filter(|row| {
            row.as_str()
                .and_then(|id| id.rsplit_once('@'))
                .is_some_and(|(id, _)| {
                    incoming
                        .iter()
                        .any(|identity| identity == id)
                })
        })
        .cloned()
        .collect::<Vec<_>>();
    let changed = rows.len() != retained.len();
    if changed {
        set_hidden(value, retained);
    }
    Ok(changed)
}
fn set_hidden(value: &mut Value, rows: Vec<Value>) {
    if rows.is_empty() {
        value
            .as_object_mut()
            .unwrap()
            .remove("updateDependents");
    } else {
        value["updateDependents"] = Value::Array(rows);
    }
}
fn same_entries(left: &Value, right: &Value) -> io::Result<bool> {
    Ok(left["scope"] == right["scope"]
        && left["name"] == right["name"]
        && normalized_entries(left)? == normalized_entries(right)?)
}
fn normalized_entries(value: &Value) -> io::Result<Vec<(String, String, bool, bool)>> {
    let mut rows = entries(value)?
        .into_iter()
        .map(|row| {
            let deleted = !row.hidden && deleted(value, &row.identity);
            (row.identity, row.head, row.hidden, deleted)
        })
        .collect::<Vec<_>>();
    rows.sort();
    Ok(rows)
}
fn deleted(value: &Value, identity: &str) -> bool {
    value["components"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["isDeleted"] == true
                        && row["id"]["scope"]
                            .as_str()
                            .zip(row["id"]["name"].as_str())
                            .is_some_and(|(scope, name)| format!("{scope}/{name}") == identity)
                })
        })
}

fn index(plan: &mut PreparedImport, lane: &Record) -> io::Result<()> {
    plan.writes.index_changed |= index_entry(&mut plan.writes.index, lane)?;
    Ok(())
}
fn index_entry(index: &mut Value, lane: &Record) -> io::Result<bool> {
    let rows = index["lanes"].as_array_mut().ok_or_else(|| invalid("lane index entries"))?;
    let identity = json!({"name":lane.value["name"],"scope":lane.value["scope"]});
    if let Some(row) = rows
        .iter_mut()
        .find(|row| row["hash"] == lane.hash)
    {
        if row["id"] == identity {
            return Ok(false);
        }
        row["id"] = identity;
    } else {
        rows.push(json!({"id":identity,"hash":lane.hash}));
    }
    Ok(true)
}

pub(super) fn remote_refs(plan: &mut PreparedImport, lane: &Record) -> io::Result<()> {
    let scope = lane.value["scope"].as_str().ok_or_else(|| invalid("lane remote scope"))?;
    let name = lane.value["name"].as_str().ok_or_else(|| invalid("lane remote name"))?;
    let file = plan.environment.local_directory
        .parent()
        .ok_or_else(|| invalid("lane local scope"))?
        .join("refs/remotes")
        .join(scope)
        .join(name);
    let mut rows = plan.capture
        .json(&file)?
        .unwrap_or_else(|| json!([]));
    let rows_mut = rows.as_array_mut().ok_or_else(|| invalid("lane remote refs"))?;
    for entry in entries(&lane.value)? {
        let (scope, name) =
            entry.identity.split_once('/').ok_or_else(|| invalid("lane remote component"))?;
        if let Some(row) = rows_mut
            .iter_mut()
            .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        {
            row["head"] = json!(entry.head);
        } else {
            rows_mut.push(json!({"id":{"scope":scope,"name":name},"head":entry.head}));
        }
    }
    plan.overlay.lane_refs.insert((scope.into(), name.into()), rows);
    Ok(())
}

fn stage_changed(
    plan: &mut PreparedImport,
    merged: &mut Record,
    incoming: &Record,
) -> io::Result<()> {
    if incoming.value["schema"].as_str().unwrap_or("0.0.0") == "0.0.0" {
        merged.value["schema"] = json!("0.0.0");
    }
    plan.overlay.objects.insert(
        merged.hash.clone(),
        publish::object(&merged.hash, "Lane", merged.value.clone())?,
    );
    index(plan, merged)?;
    if !same_entries(&merged.value, &incoming.value)? {
        let history_hash =
            crate::command_import::object_hash(&format!("{}:LaneHistory", merged.hash));
        let previous = plan.capture
            .object(&plan.environment.local_directory, &history_hash, "LaneHistory")?
            .and_then(|record| record.value);
        plan.writes.lane_histories.push(json!({"hash":history_hash,"previous":previous,"lane":merged,"message":"fetch (merge from remote)"}));
    }
    Ok(())
}

fn extend_local_history(
    plan: &mut PreparedImport,
    hash: &str,
    model: &Value,
    current: &str,
    history_value: &mut Value,
) -> io::Result<()> {
    if !history_value["versions"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| row["hash"] == current)
        })
    {
        let (_, local, _) = history::populate(
            &mut plan.capture,
            &plan.environment.local_directory,
            model,
            current,
        )?;
        let rows = history_value["versions"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane history entries"))?;
        for row in local["versions"].as_array().ok_or_else(|| invalid("lane populated history"))? {
            if !rows
                .iter()
                .any(|old| old["hash"] == row["hash"])
            {
                rows.push(row.clone());
            }
        }
        plan.overlay.objects.insert(
            hash.to_owned(),
            publish::object(hash, "VersionHistory", history_value.clone())?,
        );
    }
    Ok(())
}

fn should_replace(plan: &mut PreparedImport, merged: &Value, entry: &Entry) -> io::Result<bool> {
    let previous = entries(merged)?
        .into_iter()
        .find(|row| row.identity == entry.identity && row.hidden == entry.hidden);
    match previous {
        None => Ok(true),
        Some(previous) if previous.head == entry.head => Ok(false),
        Some(previous) => ahead(plan, &entry.identity, &previous.head, &entry.head),
    }
}

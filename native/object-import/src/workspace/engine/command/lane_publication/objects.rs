use super::super::{invalid, merge::snapshot};
use serde_json::{Value, json};
use std::io;

pub(super) fn update(
    lane: &mut Value,
    identity: &str,
    head: &str,
    hidden: bool,
    removed: bool,
) -> io::Result<()> {
    crate::merge_history::hash(head)?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("lane component identity"))?;
    if hidden {
        if lane.get("updateDependents").is_none() {
            lane["updateDependents"] = json!([]);
        }
        let entries = lane["updateDependents"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane hidden entries"))?;
        entries.retain(|entry| {
            entry
                .as_str()
                .and_then(|value| value.rsplit_once('@'))
                .is_none_or(|(value, _)| value != identity)
        });
        entries.push(json!(format!("{identity}@{head}")));
        return Ok(());
    }
    let entries = lane["components"].as_array_mut().ok_or_else(|| invalid("lane components"))?;
    let mut next = json!({"id":{"scope":scope,"name":name},"head":head});
    if removed {
        next["isDeleted"] = json!(true);
    }
    if let Some(entry) = entries
        .iter_mut()
        .find(|entry| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                entry, scope, name,
            )
        })
    {
        *entry = next;
    } else {
        entries.push(next);
    }
    Ok(())
}

pub(super) fn history(
    lane: &Value,
    hash: &str,
    mut previous: Value,
    receipt: &Value,
    message: &str,
) -> io::Result<Value> {
    let key = receipt["historyKey"]
        .as_str()
        .filter(|key| !key.is_empty() && key.len() <= 128)
        .ok_or_else(|| invalid("lane history allocation"))?;
    let log = history_log(receipt, message)?;
    if previous.is_null() {
        previous = json!({"name":lane["name"],"scope":lane["scope"],"laneHash":hash,"history":{}});
    }
    let entries =
        lane["components"].as_array().ok_or_else(|| invalid("lane history components"))?;
    let ids = entries
        .iter()
        .map(component_id)
        .collect::<io::Result<Vec<_>>>()?;
    let deleted = entries
        .iter()
        .filter(|entry| entry["isDeleted"] == true)
        .map(component_id)
        .collect::<io::Result<Vec<_>>>()?;
    let mut row = json!({"log":log,"components":ids});
    if !deleted.is_empty() {
        row["deleted"] = json!(deleted);
    }
    row["updateDependents"] = lane
        .get("updateDependents")
        .cloned()
        .unwrap_or_else(|| json!([]));
    previous["history"]
        .as_object_mut()
        .ok_or_else(|| invalid("lane history entries"))?
        .insert(key.into(), row);
    Ok(previous)
}

fn history_log(receipt: &Value, message: &str) -> io::Result<serde_json::Map<String, Value>> {
    let mut log = receipt["log"]
        .as_object()
        .cloned()
        .ok_or_else(|| invalid("lane history log"))?;
    if log
        .get("date")
        .and_then(Value::as_str)
        .is_none()
    {
        return Err(invalid("lane history date"));
    }
    log.insert("message".into(), json!(message));
    Ok(log)
}

fn component_id(entry: &Value) -> io::Result<String> {
    let (scope, name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(entry)
            .ok_or_else(|| invalid("lane history component id"))?;
    let head = entry["head"].as_str().ok_or_else(|| invalid("lane history component head"))?;
    Ok(format!("{scope}/{name}@{head}"))
}

pub(super) fn serializable(hash: &str, lane: &Value, history: &Value) -> io::Result<Vec<Value>> {
    Ok(vec![
        snapshot::object("Lane", Some(hash), lane.clone())?,
        snapshot::object("LaneHistory", None, history.clone())?,
    ])
}

pub(super) fn snapshot_update(
    lane: &mut Value,
    identity: &str,
    head: &str,
    hidden: bool,
    removed: bool,
) -> io::Result<()> {
    let was_hidden = lane["updateDependents"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row.as_str()
                        .and_then(|id| id.rsplit_once('@'))
                        .is_some_and(|(id, _)| id == identity)
                })
        });
    if hidden {
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("lane snapshot identity"))?;
        lane["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane snapshot components"))?
            .retain(|entry| {
                !crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                    entry, scope, name,
                )
            });
        if !was_hidden {
            lane["overrideUpdateDependents"] = json!(true);
        }
    } else if was_hidden {
        let entries = lane["updateDependents"].as_array_mut().unwrap();
        entries.retain(|row| {
            row.as_str()
                .and_then(|id| id.rsplit_once('@'))
                .is_none_or(|(id, _)| id != identity)
        });
        if entries.is_empty() {
            lane.as_object_mut()
                .unwrap()
                .remove("updateDependents");
        }
    }
    update(lane, identity, head, hidden, removed)
}

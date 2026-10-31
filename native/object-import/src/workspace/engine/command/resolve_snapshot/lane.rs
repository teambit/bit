use super::{super::repository::Repository, Material, invalid, snapshot};
use serde_json::{Value, json};
use std::io;

pub(super) fn lane_objects(
    lane: &Value,
    materials: &[Material],
    receipt: &Value,
    objects: &mut Vec<Value>,
    repository: &mut Repository,
) -> io::Result<()> {
    let hash = lane["hash"].as_str().ok_or_else(|| invalid("resolve lane hash"))?;
    crate::merge_history::hash(hash)?;
    let mut value = lane["value"].clone();
    if value
        .get("readmeComponent")
        .is_some_and(|row| !row.is_null())
    {
        return Err(invalid("resolve lane readme lifecycle"));
    }
    for (material, allocation) in materials
        .iter()
        .zip(receipt["versions"].as_array().unwrap())
    {
        let next = allocation["hash"].as_str().unwrap();
        update(
            &mut value,
            &material.identity,
            next,
            material.hidden,
            super::is_removed(&material.version),
        )?;
    }
    let history = history(&value, hash, receipt, repository)?;
    objects.push(snapshot::object("Lane", Some(hash), value)?);
    objects.push(snapshot::object("LaneHistory", None, history)?);
    Ok(())
}

fn update(
    lane: &mut Value,
    identity: &str,
    head: &str,
    hidden: bool,
    removed: bool,
) -> io::Result<()> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("resolve lane identity"))?;
    let visible =
        lane["components"].as_array().ok_or_else(|| invalid("resolve lane components"))?;
    let index = visible
        .iter()
        .position(|row| {
            super::super::inbound::remote::file_list::row_lane_matches(row, scope, name)
        });
    let already_hidden = lane["updateDependents"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| hidden_identity(row) == Some(identity))
        });
    if hidden {
        update_hidden(lane, identity, head, index, already_hidden)
    } else {
        update_visible(lane, scope, name, head, index, already_hidden, removed)
    }
}

fn hidden_identity(value: &Value) -> Option<&str> {
    value
        .as_str()?
        .trim()
        .rsplit_once('@')
        .map(|(identity, _)| identity.trim())
        .filter(|identity| !identity.is_empty())
}

fn remove_hidden(lane: &mut Value, identity: &str) -> io::Result<()> {
    let rows = lane["updateDependents"]
        .as_array_mut()
        .ok_or_else(|| invalid("resolve hidden lane entries"))?;
    rows.retain(|row| hidden_identity(row) != Some(identity));
    if rows.is_empty() {
        lane.as_object_mut()
            .unwrap()
            .remove("updateDependents");
    }
    Ok(())
}

fn update_hidden(
    lane: &mut Value,
    identity: &str,
    head: &str,
    index: Option<usize>,
    already_hidden: bool,
) -> io::Result<()> {
    if let Some(index) = index {
        lane["components"]
            .as_array_mut()
            .unwrap()
            .remove(index);
    }
    if !already_hidden {
        lane["overrideUpdateDependents"] = json!(true);
    }
    if lane["updateDependents"].is_null() {
        lane["updateDependents"] = json!([]);
    }
    remove_hidden(lane, identity)?;
    if lane["updateDependents"].is_null() {
        lane["updateDependents"] = json!([]);
    }
    lane["updateDependents"]
        .as_array_mut()
        .unwrap()
        .push(json!(format!("{identity}@{head}")));
    Ok(())
}

fn update_visible(
    lane: &mut Value,
    scope: &str,
    name: &str,
    head: &str,
    index: Option<usize>,
    already_hidden: bool,
    removed: bool,
) -> io::Result<()> {
    if already_hidden {
        remove_hidden(lane, &format!("{scope}/{name}"))?;
    }
    let mut entry = json!({"id":{"scope":scope,"name":name},"head":head});
    if removed {
        entry["isDeleted"] = json!(true);
    }
    if let Some(index) = index {
        lane["components"][index] = entry;
    } else {
        lane["components"]
            .as_array_mut()
            .unwrap()
            .push(entry);
    }
    Ok(())
}

fn history(
    lane: &Value,
    hash: &str,
    receipt: &Value,
    repository: &mut Repository,
) -> io::Result<Value> {
    let reference = crate::workspace::engine::hash(format!("{hash}:LaneHistory").as_bytes());
    let mut history = match repository.read(&reference, "LaneHistory") {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            json!({"name":lane["name"],"scope":lane["scope"],"laneHash":hash,"history":{}})
        }
        Err(error) => return Err(error),
    };
    let key = receipt["batchId"].as_str().ok_or_else(|| invalid("resolve lane history key"))?;
    let log = history_log(receipt)?;
    let components = lane["components"]
        .as_array()
        .ok_or_else(|| invalid("resolve lane components"))?
        .iter()
        .map(component_id)
        .collect::<io::Result<Vec<_>>>()?;
    let hidden = lane["updateDependents"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    history["history"][key] = json!({"log":log,"components":components,"updateDependents":hidden});
    Ok(history)
}

fn history_log(receipt: &Value) -> io::Result<Value> {
    let mut log = receipt["laneLog"].clone();
    if log["date"].as_str().is_none() {
        return Err(invalid("resolve lane history log"));
    }
    let message = receipt["log"]["message"].as_str().map_or("", str::trim);
    log["message"] =
        if message.is_empty() { json!("snap") } else { json!(format!("snap ({message})")) };
    Ok(log)
}

fn component_id(row: &Value) -> io::Result<String> {
    let (scope, name) = super::super::inbound::remote::file_list::row_scoped_id_parts(row)
        .ok_or_else(|| invalid("resolve lane component scope"))?;
    let head = row["head"].as_str().ok_or_else(|| invalid("resolve lane component head"))?;
    Ok(format!("{scope}/{name}@{head}"))
}

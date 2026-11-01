//! Merge parent, squash, and unrelated-history reconciliation for resolved `Version` objects.

use super::{Material, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn reconcile(
    version: &mut Value,
    material: &Material,
    allocation: &Value,
) -> io::Result<()> {
    let Some(pending) = &material.pending else { return Ok(()) };
    let remote = pending["head"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("resolve pending head"))?;
    crate::merge_history::hash(remote)?;
    if pending["unrelated"].is_object() || pending["unrelated"] == true {
        unrelated(version, material, pending, remote)?;
    } else if pending["shouldSquash"] == true {
        squash(version, pending, allocation, remote)?;
    } else {
        merge_parent(version, remote);
    }
    default_message(version, pending);
    Ok(())
}

fn unrelated(
    version: &mut Value,
    material: &Material,
    pending: &Value,
    remote: &str,
) -> io::Result<()> {
    let previous = pending["previouslyUsedVersion"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            Some(material.version_state.current_head.trim()).filter(|head| !head.is_empty())
        })
        .ok_or_else(|| invalid("resolve unrelated prior version"))?;
    crate::merge_history::hash(previous)?;
    if pending["unrelated"] == true {
        version["unrelated"] = json!({"head":previous,"laneId":pending["laneId"]});
        version["parents"] = json!([remote]);
    } else {
        let relation = &pending["unrelated"];
        let unrelated_head = relation["unrelatedHead"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("resolve unrelated head"))?;
        let head_on_lane = relation["headOnCurrentLane"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("resolve unrelated lane head"))?;
        crate::merge_history::hash(unrelated_head)?;
        crate::merge_history::hash(head_on_lane)?;
        version["unrelated"] = json!({"head":unrelated_head,"laneId":relation["unrelatedLaneId"]});
        version["parents"] = json!([head_on_lane]);
    }
    Ok(())
}

#[inline]
fn squash(
    version: &mut Value,
    pending: &Value,
    allocation: &Value,
    remote: &str,
) -> io::Result<()> {
    let parent = version["parents"][0]
        .as_str()
        .map(str::trim)
        .filter(|parent| !parent.is_empty())
        .ok_or_else(|| invalid("resolve squash parent"))?;
    version["squashed"] = json!({"previousParents":[parent,remote],"laneId":pending["laneId"]});
    if allocation["squashLog"]["date"]
        .as_str()
        .map(str::trim)
        .is_none_or(str::is_empty)
    {
        return Err(invalid("resolve squash log"));
    }
    version["modified"] = json!([allocation["squashLog"]]);
    Ok(())
}

#[inline]
fn merge_parent(version: &mut Value, remote: &str) {
    if version["parents"]
        .as_array()
        .unwrap()
        .iter()
        .all(|value| value != remote)
    {
        version["parents"]
            .as_array_mut()
            .unwrap()
            .push(json!(remote));
    }
}

#[inline]
fn default_message(version: &mut Value, pending: &Value) {
    if version["log"]["message"]
        .as_str()
        .is_some_and(|message| !message.trim().is_empty())
    {
        return;
    }
    if pending["unrelated"] == true || pending["unrelated"].is_object() {
        return;
    }
    let id = &pending["laneId"];
    let message = if let Some(lane) = id
        .as_str()
        .map(str::trim)
        .filter(|lane| !lane.is_empty())
    {
        format!("merge {lane}")
    } else {
        format!(
            "merge {}/{}",
            id["scope"].as_str().map_or("", str::trim),
            id["name"].as_str().map_or("", str::trim),
        )
    };
    version["log"]["message"] = json!(message);
}

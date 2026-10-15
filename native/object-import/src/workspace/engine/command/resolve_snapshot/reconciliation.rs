use super::{Material, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn reconcile(
    version: &mut Value,
    material: &Material,
    allocation: &Value,
) -> io::Result<()> {
    let Some(pending) = &material.pending else { return Ok(()) };
    let remote = pending["head"].as_str().ok_or_else(|| invalid("resolve pending head"))?;
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
        .or(Some(material.version_state.current_head.as_str()))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("resolve unrelated prior version"))?;
    if pending["unrelated"] == true {
        version["unrelated"] = json!({"head":previous,"laneId":pending["laneId"]});
        version["parents"] = json!([remote]);
    } else {
        let relation = &pending["unrelated"];
        version["unrelated"] =
            json!({"head":relation["unrelatedHead"],"laneId":relation["unrelatedLaneId"]});
        version["parents"] = json!([relation["headOnCurrentLane"]]);
    }
    Ok(())
}

fn squash(
    version: &mut Value,
    pending: &Value,
    allocation: &Value,
    remote: &str,
) -> io::Result<()> {
    let parent = version["parents"][0].as_str().ok_or_else(|| invalid("resolve squash parent"))?;
    version["squashed"] = json!({"previousParents":[parent,remote],"laneId":pending["laneId"]});
    if allocation["squashLog"]["date"].as_str().is_none() {
        return Err(invalid("resolve squash log"));
    }
    version["modified"] = json!([allocation["squashLog"]]);
    Ok(())
}

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

fn default_message(version: &mut Value, pending: &Value) {
    if version["log"]["message"]
        .as_str()
        .is_some_and(|message| !message.is_empty())
    {
        return;
    }
    if pending["unrelated"] == true || pending["unrelated"].is_object() {
        return;
    }
    let id = &pending["laneId"];
    version["log"]["message"] = json!(format!(
        "merge {}/{}",
        id["scope"].as_str().unwrap_or_default(),
        id["name"].as_str().unwrap_or_default()
    ));
}

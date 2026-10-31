#[cfg(test)]
mod tests;

use super::merge;
use serde_json::{Value, json};

pub(super) fn entry(
    model: &Value,
    remote: &str,
    lane: Option<&Value>,
    material: &merge::Prepared,
) -> Value {
    let mut unmerged = json!({"id":{"name":model["name"],"scope":model["scope"]},"head":remote,
        "laneId":lane_id(model,lane),"shouldSquash":lane.is_some_and(|value|value["shouldSquash"]==true),"mergedConfig":{}});
    if material.no_write()
        && let Some(object) = unmerged.as_object_mut()
    {
        object.remove("mergedConfig");
    }
    if material.has_conflicts() {
        unmerged["unmergedPaths"] = json!(material.conflict_paths);
    }
    unmerged
}

fn lane_id(model: &Value, lane: Option<&Value>) -> Value {
    if let Some(other) = lane.map(|value| &value["otherId"]) {
        if let Some(raw) = other.as_str() {
            if let Some((scope, name)) = raw.split_once('/')
                && name != "main"
            {
                return json!({"scope": scope, "name": name});
            }
        } else if other["name"]
            .as_str()
            .is_some_and(|name| name != "main")
        {
            return other.clone();
        }
    }
    json!({"scope": model["scope"], "name": "main"})
}

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
    lane.and_then(|value| other_lane(&value["otherId"]))
        .unwrap_or_else(|| json!({"scope": model["scope"], "name": "main"}))
}

fn other_lane(other: &Value) -> Option<Value> {
    if let Some(raw) = other.as_str().map(str::trim) {
        let (scope, name) = raw.split_once('/')?;
        let scope = scope.trim();
        let name = name.trim();
        return (!scope.is_empty() && !name.is_empty() && name != "main").then(
            || json!({"scope": scope, "name": name}),
        );
    }
    let scope = other["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())?;
    let name = other["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty() && *name != "main")?;
    Some(json!({"scope": scope, "name": name}))
}

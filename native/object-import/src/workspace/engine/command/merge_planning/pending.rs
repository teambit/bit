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
    if material.no_write() {
        unmerged
            .as_object_mut()
            .unwrap()
            .remove("mergedConfig");
    }
    if material.has_conflicts() {
        unmerged["unmergedPaths"] = json!(material.conflict_paths);
    }
    unmerged
}

fn lane_id(model: &Value, lane: Option<&Value>) -> Value {
    lane.filter(|value| value["otherId"]["name"] != "main")
        .map_or_else(
            || json!({"scope":model["scope"],"name":"main"}),
            |value| value["otherId"].clone(),
        )
}

#[cfg(test)]
mod tests;

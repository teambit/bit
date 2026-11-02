//! Construct unmerged component entries via [`entry`] for pending [`merge`] state persistence.

#[cfg(test)]
mod tests;

use super::merge;
use serde_json::{Value, json};

/// Builds an `unmerged.json` entry for a merged component from `model`, `remote`, and `material`.
pub(super) fn entry(
    model: &Value,
    remote: &str,
    lane: Option<&Value>,
    material: &merge::Prepared,
) -> Value {
    let mut unmerged = json!({"id":{"name":model_field(model,"name"),"scope":model_field(model,"scope")},"head":remote.trim(),
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

/// Resolves the `{ scope, name }` lane identifier for an unmerged entry, defaulting to `main`.
#[inline]
fn lane_id(model: &Value, lane: Option<&Value>) -> Value {
    lane.and_then(|value| other_lane(&value["otherId"]))
        .unwrap_or_else(|| json!({"scope": model_field(model, "scope"), "name": "main"}))
}

/// Returns the trimmed string value of `model[key]` or clones the raw JSON value when non-string.
#[inline]
fn model_field(model: &Value, key: &str) -> Value {
    model[key]
        .as_str()
        .map_or_else(|| model[key].clone(), |text| json!(text.trim()))
}

/// Parses a non-`main` `{ scope, name }` lane identifier from `other`, if valid.
#[inline]
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

//! `ExportMain` writes the last cloud build ([`remember`], [`exported_lane`]) after its post-export callback; write failures are logged (`export.main.runtime.ts`).
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// Persists `rippleJobs` and [`exported_lane`] metadata from `receipt` and `metadata` ([`Value`]) after export.
#[inline]
pub(super) fn remember(root: &Path, receipt: &Value, metadata: &Value) -> io::Result<()> {
    let jobs: Vec<Value> = receipt["rippleJobs"]
        .as_array()
        .or_else(|| metadata["lastExport"]["rippleJobs"].as_array())
        .into_iter()
        .flatten()
        .filter(|job| {
            !job.is_null()
                && job
                    .as_str()
                    .is_none_or(|text| !text.trim().is_empty())
        })
        .cloned()
        .collect();
    if jobs.is_empty() {
        return Ok(());
    }
    let mut last = json!({"timestamp":crate::history::iso_now(),"rippleJobs":jobs});
    if let Some(lane) = metadata["lastExport"]
        .get("lane")
        .filter(|lane| !lane.is_null())
        .and_then(|lane| exported_lane(lane).or_else(|| lane.is_object().then(|| lane.clone())))
        .or_else(|| {
            receipt["exportedLanes"]
                .as_array()
                .and_then(|lanes| lanes.iter().find_map(exported_lane))
        })
    {
        last["lane"] = lane;
    }
    last["exportedComponents"] = metadata["lastExport"]
        .get("exportedComponents")
        .filter(|comps| !comps.is_null())
        .unwrap_or_else(|| &receipt["componentsIds"])
        .clone();
    fs::write(
        bit_object_import::scope_path(root).join("last-export.json"),
        serde_json::to_vec_pretty(&last)?,
    )
}

/// Converts a string or object lane `entry` into a `{"scope": ..., "name": ...}` JSON object for [`remember`].
#[inline]
fn exported_lane(entry: &Value) -> Option<Value> {
    if let Some((scope, name)) = entry
        .as_str()
        .and_then(|lane| lane.trim().split_once('/'))
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
    {
        return Some(json!({"scope":scope,"name":name}));
    }
    let scope = entry["scope"]
        .as_str()
        .or_else(|| entry["id"]["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())?;
    let name = entry["name"]
        .as_str()
        .or_else(|| entry["id"]["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    Some(json!({"scope":scope,"name":name}))
}

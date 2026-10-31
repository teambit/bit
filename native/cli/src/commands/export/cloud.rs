//! `ExportMain` writes the last cloud build after its post-export callback; write failures are logged.
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn remember(root: &Path, receipt: &Value, metadata: &Value) -> io::Result<()> {
    let Some(jobs) = receipt["rippleJobs"]
        .as_array()
        .filter(|jobs| !jobs.is_empty())
    else {
        return Ok(());
    };
    let mut last = json!({"timestamp":crate::history::iso_now(),"rippleJobs":jobs});
    if let Some(lane) = metadata["lastExport"]
        .get("lane")
        .filter(|lane| !lane.is_null())
    {
        last["lane"] = lane.clone();
    } else if let Some(lane) = exported_lane(&receipt["exportedLanes"][0]) {
        last["lane"] = lane;
    }
    last["exportedComponents"] = metadata["lastExport"]
        .get("exportedComponents")
        .unwrap_or_else(|| &receipt["componentsIds"])
        .clone();
    fs::write(
        bit_object_import::scope_path(root).join("last-export.json"),
        serde_json::to_vec_pretty(&last)?,
    )
}

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

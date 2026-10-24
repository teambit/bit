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
    if let Some(lane) = metadata["lastExport"].get("lane") {
        last["lane"] = lane.clone();
    } else if let Some(lane) = receipt["exportedLanes"][0].as_str()
        && let Some((scope, name)) = lane.split_once('/')
    {
        last["lane"] = json!({"scope":scope,"name":name});
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

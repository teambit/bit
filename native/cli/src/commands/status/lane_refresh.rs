//! Retained main-history refresh for `status --lanes`.

use super::{
    Engine,
    js::{array, decline, text},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) fn prepare(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    result: &Value,
    current_lane_id: &str,
) -> io::Result<Option<(Value, Value, usize)>> {
    let known = array(context.get("models"), "models")?
        .iter()
        .filter_map(|model| {
            Some(format!("{}/{}", model["scope"].as_str()?, model["name"].as_str()?))
        })
        .collect::<HashSet<_>>();
    let targets = array(context.get("targets"), "targets")?
        .iter()
        .filter(|target| {
            target["version"]
                .as_str()
                .is_some_and(|version| !version.is_empty())
                && target["identity"]
                    .as_str()
                    .is_some_and(|id| known.contains(id))
        })
        .map(|target| json!({"identity":target["identity"],"version":target["version"]}))
        .collect::<Vec<_>>();
    if targets.is_empty() {
        return Ok(None);
    }
    let ids = targets
        .iter()
        .map(|target| text(target.get("identity")).map(str::to_owned))
        .collect::<io::Result<Vec<_>>>()?;
    let prepared = super::super::import::prepare_status_refresh(engine, root, &ids)?;
    let token = prepared.get("token").ok_or_else(|| decline("status main refresh token"))?;
    let updates: Value = engine.request(&json!({
        "kind":"statusLaneUpdates", "root":root,"token":token,
        "currentLaneId":current_lane_id,"targets":targets,
        "duringMerge":result["componentsDuringMergeState"],
    }))?;
    array(updates.get("pendingUpdatesFromMain"), "pending main updates")?;
    let count = prepared["refreshCount"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("status main refresh count"))?;
    Ok(Some((token.clone(), updates, count)))
}

pub(super) use addition::capture as addition;
pub(super) use hidden::from_model;
mod addition;
mod hidden;
mod normalized;
#[cfg(test)]
mod tests;
use super::super::{invalid, read, status_models::comparison};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) struct Captured {
    pub(super) hidden: bool,
    pub(super) model_backed: bool,
    pub(super) added: bool,
    pub(super) target: comparison::Target,
    pub(super) metadata: Value,
    pub(super) files: Value,
}
pub(super) fn all(
    root: &Path,
    inputs: Vec<Value>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Captured>> {
    all_with(root, inputs, snapshots, pool, false)
}

pub(super) fn all_for_snapshot(
    root: &Path,
    inputs: Vec<Value>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Captured>> {
    all_with(root, inputs, snapshots, pool, true)
}

pub(super) fn all_for_checkout(
    root: &Path,
    inputs: Vec<Value>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Captured>> {
    let mut captured = all_with(root, inputs, snapshots, pool, true)?;
    for target in &mut captured {
        for file in target.files.as_array_mut().ok_or_else(|| invalid("checkout files"))? {
            file.as_object_mut()
                .ok_or_else(|| invalid("checkout source"))?
                .remove("bitmapSource");
        }
    }
    Ok(captured)
}

fn all_with(
    root: &Path,
    inputs: Vec<Value>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
    allow_root: bool,
) -> io::Result<Vec<Captured>> {
    let targets = targets(inputs, allow_root)?;
    let captured = normalized::read(root, &targets, pool)?;
    let mut captured = captured.into_iter();
    targets.into_iter().map(|target| {
        let mut metadata = Vec::new();
        let mut files = Vec::new();
        for file in &target.files {
            let (observed, contents) = captured.next().ok_or_else(|| invalid("command capture count"))?;
            let token = snapshots.retain(snapshots::Observation {
                path: observed.path.clone(), raw_hash: observed.hash.clone(),
                snapshot_hash: observed.snapshot_hash.clone(), raw_bytes: observed.raw_bytes,
                contents: contents.into(),
            }).ok_or_else(|| invalid("command capture retention"))?;
            metadata.push(json!({"relativePath":file,"name":file.rsplit('/').next(),"test":false,"file":observed.linux_hash}));
            let mut source = json!({"relativePath":file,"path":observed.path,"rawHash":observed.hash,
                "snapshotHash":observed.snapshot_hash,"readToken":token,"protected":false});
            if target.directory == "." && file == ".bitmap" {
                source["bitmapSource"] = json!(true);
                source["protected"] = json!(true);
            }
            files.push(source);
        }
        Ok(Captured { added: false, hidden: false, model_backed: false, target, metadata: Value::Array(metadata), files: Value::Array(files) })
    }).collect()
}
pub(super) fn lane_visibility(captured: &mut [Captured], context: &Value) -> io::Result<()> {
    let Some(rows) = context["lane"]["targets"].as_array() else { return Ok(()) };
    for component in captured {
        let row = rows
            .iter()
            .find(|row| row["identity"] == component.target.identity)
            .ok_or_else(|| invalid("captured component outside lane selection"))?;
        component.hidden = row["hidden"] == true;
    }
    Ok(())
}
fn targets(inputs: Vec<Value>, allow_root: bool) -> io::Result<Vec<comparison::Target>> {
    let mut seen = HashSet::new();
    inputs
        .into_iter()
        .map(|mut value| {
            value
                .as_object_mut()
                .ok_or_else(|| invalid("command current"))?
                .remove("peerDependencies");
            let target: comparison::Target =
                serde_json::from_value(value).map_err(io::Error::other)?;
            comparison::capture::validate(&target)?;
            if (!allow_root && target.directory == ".") || !seen.insert(target.identity.clone()) {
                return Err(invalid("command root or duplicate component"));
            }
            Ok(target)
        })
        .collect()
}

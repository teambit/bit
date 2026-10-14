pub(super) use addition::capture as addition;
pub(super) use hidden::from_model;
mod addition;
mod hidden;
use super::super::{invalid, read, status_models::comparison};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) struct Captured {
    pub(super) hidden: bool,
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
    let targets = targets(inputs)?;
    let paths = targets
        .iter()
        .flat_map(|target| {
            target.files
                .iter()
                .map(|file| root.join(&target.directory).join(file))
        })
        .collect::<Vec<_>>();
    let captured = read::read_with_budget(&paths, pool, snapshots::MAX_BYTES, read::canonical)?;
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
            files.push(json!({"relativePath":file,"path":observed.path,"rawHash":observed.hash,
                "snapshotHash":observed.snapshot_hash,"readToken":token,"protected":false}));
        }
        Ok(Captured { added: false, hidden: false, target, metadata: Value::Array(metadata), files: Value::Array(files) })
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
fn targets(inputs: Vec<Value>) -> io::Result<Vec<comparison::Target>> {
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
            if target.directory == "." || !seen.insert(target.identity.clone()) {
                return Err(invalid("command root or duplicate component"));
            }
            Ok(target)
        })
        .collect()
}

#[cfg(test)]
mod tests;

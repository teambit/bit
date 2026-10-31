//! Keep the old lane active through `ComponentWriter` installation and compilation.
#[cfg(test)]
mod tests;
use super::{Record, State, bitmap, input::Operation, invalid};
use crate::command_import::lane::SwitchTracking;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Retained {
    root: PathBuf,
    bitmap: bitmap::Prepared,
    tracking: Option<SwitchTracking>,
    applied: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    file_id: String,
    #[serde(default)]
    owned_workspace_writes: Vec<Value>,
}

pub(super) fn prepare(
    record: &mut Record,
    first: &mut bitmap::Prepared,
    planned: &super::planning::Planned,
) -> io::Result<Option<Retained>> {
    if record.request.operation != Operation::Switch {
        return Ok(None);
    }
    let publish_checkout = planned.materials.iter().any(|material| !material.keep_ours);
    let bitmap = first.switch_continuation(&record.context, publish_checkout)?;
    let tracking = record.repository.defer_switch_tracking()?;
    Ok(Some(Retained { root: record.request.root.clone(), bitmap, tracking, applied: false }))
}
impl Retained {
    pub(super) fn pending(&self) -> io::Result<()> {
        if self.applied {
            return Err(invalid("switch checkout already published"));
        }
        if let Some(tracking) = &self.tracking {
            tracking.validate()?;
        }
        Ok(())
    }
    pub(super) fn published(&mut self) -> io::Result<()> {
        self.bitmap.validate()?;
        self.applied = true;
        Ok(())
    }
    fn commit(&self, file_id: &str) -> io::Result<Value> {
        if !self.applied {
            return Err(invalid("switch checkout not published"));
        }
        self.bitmap.validate()?;
        if let Some(tracking) = &self.tracking {
            tracking.validate()?;
        }
        cleanup(&self.root)?;
        let mut writes = Vec::new();
        if let Some(tracking) = &self.tracking {
            writes.push(tracking.commit()?);
        }
        let warning = self.bitmap.commit(file_id, "lane-switch")?;
        writes.push(self.bitmap.publication_receipt()?);
        Ok(json!({"completed":true,"warning":warning,"ownedWorkspaceWrites":writes}))
    }
}
pub(in crate::workspace::engine) fn complete(
    input: &Complete,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    bitmap::validate_history_file_id(&input.file_id)?;
    if !input.owned_workspace_writes.is_empty() {
        return Err(invalid("switch completion has no acknowledged installer bitmap writes"));
    }
    let record = state.record.take().ok_or_else(|| invalid("switch completion owner absent"))?;
    let token = input.token.trim();
    if token.is_empty() || record.token != token {
        return Err(invalid("switch completion token"));
    }
    let retained = record.planned
        .as_ref()
        .and_then(|plan| plan.switch_completion.as_ref())
        .ok_or_else(|| invalid("switch completion plan absent"))?;
    let mut output = retained.commit(&input.file_id)?;
    output["token"] = json!(record.token);
    Ok((1, output))
}
fn cleanup(root: &Path) -> io::Result<()> {
    let path = root.join(".bitTmp");
    // Published pathExists follows symlinks and leaves dangling links untouched.
    if fs::metadata(&path).is_err() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(&path)?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

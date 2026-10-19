//! Checkout publishes files under the old lane before installer/compiler finalization.
use super::{Planned, commit_receipt, file_id};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::commands) fn apply(planned: &mut Planned, root: &Path) -> io::Result<Value> {
    let receipt = commit_receipt(planned, root)?;
    if receipt["requiresSwitchCompletion"] != true || receipt["token"] != planned.token {
        return Err(io::Error::other("switch checkout publication receipt"));
    }
    Ok(receipt)
}

/// Both graceful install/compiler errors still reach LaneSwitcher.saveLanesData.
pub(in crate::commands) fn complete(planned: &mut Planned, receipt: &Value) -> io::Result<()> {
    if receipt["requiresSwitchCompletion"] != true || receipt["token"] != planned.token {
        return Err(io::Error::other("switch completion owner"));
    }
    let completed: Value = planned.engine.request(&json!({
        "kind":"commandSwitchComplete","token":planned.token,"fileId":file_id(),
        "ownedWorkspaceWrites":[],
    }))?;
    if completed["completed"] != true || completed["token"] != planned.token {
        return Err(io::Error::other("switch finalization receipt"));
    }
    Ok(())
}

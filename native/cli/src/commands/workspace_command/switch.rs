//! Checkout publishes files under the old lane before installer/compiler finalization.
use super::{Planned, commit_receipt, file_id};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::commands) fn apply(planned: &mut Planned, root: &Path) -> io::Result<Value> {
    let receipt = commit_receipt(planned, root)?;
    if !valid_switch_receipt(&receipt, "requiresSwitchCompletion", &planned.token) {
        return Err(io::Error::other("switch checkout publication receipt"));
    }
    Ok(receipt)
}

/// Both graceful install/compiler errors still reach LaneSwitcher.saveLanesData.
pub(in crate::commands) fn complete(planned: &mut Planned, receipt: &Value) -> io::Result<()> {
    if !valid_switch_receipt(receipt, "requiresSwitchCompletion", &planned.token) {
        return Err(io::Error::other("switch completion owner"));
    }
    let completed: Value = planned.engine.request(&json!({
        "kind":"commandSwitchComplete","token":planned.token,"fileId":file_id(),
        "ownedWorkspaceWrites":[],
    }))?;
    if !valid_switch_receipt(&completed, "completed", &planned.token) {
        return Err(io::Error::other("switch finalization receipt"));
    }
    Ok(())
}

fn valid_switch_receipt(receipt: &Value, flag_key: &str, expected_token: &str) -> bool {
    let flag_ok = receipt[flag_key] == true || receipt[flag_key].as_str() == Some("true");
    let token_ok = receipt["token"]
        .as_str()
        .map(str::trim)
        .is_some_and(|token| token == expected_token.trim() && !token.is_empty());
    flag_ok && token_ok
}

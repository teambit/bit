//! Checkout publishes files under the old lane before installer/compiler finalization.
//!
//! [`apply`], [`complete`], and [`valid_switch_receipt`] validate [`commit_receipt`] tokens on [`Planned`] switch checkouts.
use super::{Planned, commit_receipt, file_id};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Commit workspace checkout files on [`Planned`] for a lane switch ([`commit_receipt`], [`valid_switch_receipt`]) and verify the switch publication receipt.
#[inline]
pub(in crate::commands) fn apply(planned: &mut Planned, root: &Path) -> io::Result<Value> {
    let receipt = commit_receipt(planned, root)?;
    if !valid_switch_receipt(&receipt, "requiresSwitchCompletion", &planned.token) {
        return Err(io::Error::other("switch checkout publication receipt"));
    }
    Ok(receipt)
}

/// Both graceful install/compiler errors still reach `LaneSwitcher.saveLanesData`.
#[inline]
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

/// Verifies that `receipt` ([`Value`]) is an error-free JSON object with a truthy `flag_key` and matching `expected_token`.
#[inline]
fn valid_switch_receipt(receipt: &Value, flag_key: &str, expected_token: &str) -> bool {
    let flag_val = &receipt[flag_key];
    let flag_ok = receipt.is_object()
        && receipt.get("error").is_none_or(Value::is_null)
        && (flag_val == true
            || flag_val
                .as_str()
                .is_some_and(|val| val.trim().eq_ignore_ascii_case("true")));
    if !flag_ok {
        return false;
    }
    let expected = expected_token.trim();
    !expected.is_empty() && receipt["token"].as_str().map(str::trim) == Some(expected)
}

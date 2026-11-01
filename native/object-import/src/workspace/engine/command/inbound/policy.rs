//! Complete shared `ConfigMerger` policy planning before inbound publication.

use super::{State, invalid};
use serde::Deserialize;
use serde_json::Value;
use std::io;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    semver: Value,
}

#[inline]
pub(in crate::workspace::engine) fn complete(
    input: Complete,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.inbound.as_mut().ok_or_else(|| invalid("inbound policy owner absent"))?;
    let token = input.token.trim();
    if token.is_empty()
        || token.len() > 256
        || token.chars().any(char::is_control)
        || retained.token != token
        || retained.receipt["completed"] == true
    {
        return Err(invalid("inbound policy token"));
    }
    let workspace =
        retained.workspace.as_mut().ok_or_else(|| invalid("inbound policy workspace absent"))?;
    if let Some(report) = workspace.complete_policy(input.semver)? {
        retained.receipt["workspaceConfigUpdateResult"] = report;
    }
    if let Some(object) = retained.receipt.as_object_mut() {
        object.remove("checkoutPolicyPreparation");
    }
    let result = if retained.applied {
        workspace.commit_policy()?;
        let mut done = state.inbound.take().expect("checked above").receipt;
        done["completed"] = serde_json::json!(true);
        done
    } else {
        retained.receipt.clone()
    };
    let count = result["importedIds"].as_array().map_or(0, Vec::len);
    Ok((count, result))
}

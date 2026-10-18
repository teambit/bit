//! Complete shared `ConfigMerger` policy planning before inbound publication.
use super::{State, invalid};
use serde::Deserialize;
use serde_json::Value;
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    semver: Value,
}

pub(in crate::workspace::engine) fn complete(
    input: Complete,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.inbound.as_mut().ok_or_else(|| invalid("inbound policy owner absent"))?;
    if retained.token != input.token {
        return Err(invalid("inbound policy token"));
    }
    let workspace =
        retained.workspace.as_mut().ok_or_else(|| invalid("inbound policy workspace absent"))?;
    if let Some(report) = workspace.complete_policy(input.semver)? {
        retained.receipt["workspaceConfigUpdateResult"] = report;
    }
    retained.receipt
        .as_object_mut()
        .unwrap()
        .remove("checkoutPolicyPreparation");
    if retained.applied {
        workspace.commit_policy()?;
        retained.receipt["completed"] = serde_json::json!(true);
    }
    let result = retained.receipt.clone();
    let count = result["importedIds"].as_array().map_or(0, Vec::len);
    if result["completed"] == true {
        state.inbound = None;
    }
    Ok((count, result))
}

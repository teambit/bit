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
    Ok((retained.receipt["importedIds"].as_array().map_or(0, Vec::len), retained.receipt.clone()))
}

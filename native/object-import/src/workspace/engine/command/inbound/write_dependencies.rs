//! Import finalization after bitmap publication and actual workspace class loads.
mod aggregate;
mod publication;

use super::{State, invalid, requested_target};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    token: String,
    facts: Value,
    read_set: Vec<super::super::proof::Proof>,
}

pub(in crate::workspace::engine) fn complete(
    request: &Request,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained =
        state.inbound.as_mut().ok_or_else(|| invalid("inbound dependencies owner absent"))?;
    if retained.token != request.token.trim() || !retained.applied {
        return Err(invalid("inbound dependencies owner phase"));
    }
    let workspace =
        retained.workspace.as_mut().ok_or_else(|| invalid("inbound workspace absent"))?;
    super::super::proof::verify(&request.read_set)?;
    let dependencies = aggregate::prepare(&request.facts)?;
    publication::write(
        workspace.root(),
        workspace.dependency_target()?,
        &dependencies,
        workspace.history_file_id(),
    )?;
    let targets = retained.receipt["importedIds"]
        .as_array()
        .ok_or_else(|| invalid("inbound imported identifiers"))?
        .iter()
        .map(|id| requested_target(id.as_str().unwrap_or_default()))
        .collect::<io::Result<Vec<_>>>()?;
    workspace.refresh_policy(&targets, &mut retained.import)?;
    retained.receipt["requiresWriteDependencies"] = json!(false);
    if let Some(input) = workspace.policy_input() {
        retained.receipt["checkoutPolicyPreparation"] = input.clone();
    } else {
        retained.receipt["completed"] = json!(true);
    }
    let result = retained.receipt.clone();
    let count = targets.len();
    if result["completed"] == true {
        state.inbound = None;
    }
    Ok((count, result))
}

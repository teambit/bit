//! Import finalization ([`Request`], [`complete`], [`State`]) after `.bitmap` publication and actual workspace class loads.

mod aggregate;
mod publication;

use super::{State, invalid, requested_target};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

/// Deserialized completion request carrying workspace dependency facts and read proofs.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    token: String,
    facts: Value,
    read_set: Vec<super::super::proof::Proof>,
}

/// Completes `--write-deps` publication and refreshes workspace policy state after `.bitmap` commit.
pub(in crate::workspace::engine) fn complete(
    request: &Request,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained =
        state.inbound.as_mut().ok_or_else(|| invalid("inbound dependencies owner absent"))?;
    let token = request.token.trim();
    if token.is_empty()
        || retained.token.trim() != token
        || !retained.applied
        || retained.receipt["requiresWriteDependencies"] != true
    {
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
    let targets = imported_targets(&retained.receipt)?;
    workspace.refresh_policy(&targets, &mut retained.import)?;
    retained.receipt["requiresWriteDependencies"] = json!(false);
    let result = if let Some(input) = workspace.policy_input() {
        retained.receipt["checkoutPolicyPreparation"] = input.clone();
        retained.receipt.clone()
    } else {
        let mut done = state.inbound.take().expect("checked above").receipt;
        done["completed"] = json!(true);
        done
    };
    Ok((targets.len(), result))
}

#[inline]
fn imported_targets(receipt: &Value) -> io::Result<Vec<super::Target>> {
    receipt["importedIds"]
        .as_array()
        .ok_or_else(|| invalid("inbound imported identifiers"))?
        .iter()
        .map(|id| {
            requested_target(id.as_str().ok_or_else(|| invalid("inbound imported identifiers"))?)
        })
        .collect()
}

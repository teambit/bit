pub(super) mod bitmap;
mod context;
mod lane;
mod publication;
mod restore;
#[cfg(test)]
mod tests;

use super::{Record, State, invalid, proof, reset};
use crate::workspace::snapshots;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    operation: Operation,
    options: Options,
    #[serde(default)]
    dependency_grammar: Value,
}
#[derive(Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
    ComponentAbort,
    LaneAbort,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    #[serde(default)]
    callback_lifecycle: bool,
    pattern: Option<String>,
    #[serde(default)]
    silent: bool,
    #[serde(default, rename = "verbose")]
    _verbose: bool,
    skip_dependency_installation: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Plan {
    token: String,
    current: Vec<Value>,
    semver: Value,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Restore {
    token: String,
    file_id: String,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
    file_id: String,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
    checkout_error: Option<CheckoutError>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CheckoutError {
    message: String,
}
pub(super) struct Retained {
    restored: bool,
    restored_file_id: Option<String>,
    record: Record,
    operation: Operation,
    restore: restore::Prepared,
    pending: Value,
    result: Value,
}
pub(in crate::workspace::engine) fn prepare(
    request: &Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    if state.record.is_some() || state.recovery.is_some() || state.resolve.is_some() {
        return Err(invalid("command owner already active"));
    }
    let retained = context::prepare(request, state, pool)?;
    let targets = &retained.record.targets;
    let output = json!({"token":retained.record.token,"context":retained.record.context,
        "restoredItems":retained.restore.items,"targets":targets,"captureTargets":targets.iter().filter(|row|row["missingRoot"]!=true).collect::<Vec<_>>()});
    let count = targets.len();
    state.recovery = Some(retained);
    Ok((count, output))
}
pub(in crate::workspace::engine) fn plan(
    input: Plan,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.recovery.take().ok_or_else(|| invalid("recovery owner absent"))?;
    let token = input.token.trim();
    if retained.record.token != token {
        return Err(invalid("recovery token changed"));
    }
    proof::verify(&input.dependency_read_set)?;
    retained.restore.validate_dependencies(&input.dependency_read_set)?;
    retained.record.proofs.extend(input.dependency_read_set);
    let prepared = reset::plan(
        &mut retained.record,
        input.current,
        &input.semver,
        retained.restore.bitmap.clone(),
        snapshots,
        pool,
    )?;
    retained.result = match retained.operation {
        Operation::ComponentAbort => {
            json!({"abortedComponents":prepared.plan.result["components"]})
        }
        Operation::LaneAbort => {
            json!({"checkoutResults":prepared.plan.result,"restoredItems":retained.restore.items})
        }
    };
    let output = json!({"token":token,"result":retained.result,"progress":retained.record.repository.progress()});
    let count = retained.record.targets.len();
    retained.record.planned = Some(prepared);
    snapshots.command.recovery = Some(retained);
    Ok((count, output))
}
pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let file_id = input.file_id.trim();
    super::bitmap::validate_history_file_id(file_id)?;
    let mut retained = state.recovery.take().ok_or_else(|| invalid("recovery owner absent"))?;
    if retained.record.token != input.token.trim() {
        return Err(invalid("recovery token changed"));
    }
    if let Some(result) = publication::failed_checkout(input, &retained)? {
        return Ok((retained.record.targets.len(), json!({"applied":true,"result":result})));
    }
    let mut prepared =
        retained.record.planned.take().ok_or_else(|| invalid("recovery plan absent"))?;
    if let Some(result) = publication::validate_apply(input, &retained, &prepared)? {
        return Ok((retained.record.targets.len(), json!({"applied":true,"result":result})));
    }
    proof::verify(&input.dependency_read_set)?;
    let checkout = reset::publish(&retained.record, &mut prepared, file_id);
    match (retained.operation, checkout) {
        (Operation::ComponentAbort, result) => {
            result?;
            write_pending(&retained.record.request.root, &retained.pending)?;
        }
        (Operation::LaneAbort, Err(error)) => {
            retained.result = json!({"restoredItems":retained.restore.items,"checkoutError":{"message":error.to_string()}});
        }
        (Operation::LaneAbort, Ok(_)) => {}
    }
    Ok((retained.record.targets.len(), json!({"applied":true,"result":retained.result})))
}
fn write_pending(root: &std::path::Path, pending: &Value) -> io::Result<()> {
    // UnmergedComponents.write uses JSON.stringify(..., null, 2).
    std::fs::write(
        crate::scope_path(root).join("unmerged.json"),
        serde_json::to_vec_pretty(pending).map_err(io::Error::other)?,
    )
}

pub(in crate::workspace::engine) fn restore(
    input: &Restore,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    publication::restore(input, state)
}

//! Owned main/lane merge policy and retained materialization lifecycle.
pub(crate) mod reads;

mod bodies;
#[cfg(test)]
mod body_tests;
mod cache;
mod decision;
mod dependencies;
mod journal;
mod order;
mod removals;
mod selection;
mod status;
#[cfg(test)]
mod tests;

use serde_json::{Value, json};
use std::io;
#[derive(Default)]
pub(crate) struct State {
    journal: journal::State,
    status: status::State,
    bodies: bodies::State,
}
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
        "mergePrepare" => state.bodies.prepare(input, &state.journal, None),
        "mergeApply" => state.bodies.apply(&input, &state.journal),
        "mergePlanOrder" => state.bodies.order(&input, &state.journal),
        "mergeRemovals" => state.bodies.removals(&input, &state.journal),
        "mergeMaterialize" => state.bodies.materialize(&input, &state.journal),
        "mergeTransactionBegin" => state.journal.begin(input),
        "mergeTransactionReceipt" => state.journal.receipt(input),
        "mergeStatusBegin" => state.status.begin(input, &state.journal),
        "mergeStatusReceipt" => state.status.receipt(input, &state.journal),
        "mergeApplyDecision" => {
            verify(&input, &state.journal)?;
            decision::apply(&input)
        }
        "mergeLaneBucketDecision" => {
            verify(&input, &state.journal)?;
            decision::bucket(&input)
        }
        "mergeTransactionFinish" => {
            let token = input["token"].as_str().ok_or_else(|| invalid("merge finish token"))?;
            let tokens = state.journal.finish(token)?;
            state.status.finish(&tokens);
            state.bodies.finish(&tokens)?;
            Ok(json!({"finished":true}))
        }
        _ => policy(kind, &input, &state.journal),
    }
}
pub(crate) fn prepare_with_workspace(
    input: Value,
    state: &mut State,
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<Value> {
    state.bodies.prepare(input, &state.journal, Some(snapshots))
}
fn verify(input: &Value, state: &journal::State) -> io::Result<()> {
    let token = input["token"].as_str().ok_or_else(|| invalid("merge owner token"))?;
    let index = input["index"]
        .as_u64()
        .filter(|index| *index < 4096)
        .ok_or_else(|| invalid("merge component index"))?;
    state.verify(token, index as usize)
}
fn verify_owner(input: &Value, state: &journal::State) -> io::Result<()> {
    let token = input["token"].as_str().ok_or_else(|| invalid("merge owner token"))?;
    let index = input["index"]
        .as_u64()
        .filter(|index| *index == 0)
        .ok_or_else(|| invalid("merge operation index"))?;
    state.verify_owner(token, index as usize)
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn policy(kind: &str, input: &Value, state: &journal::State) -> io::Result<Value> {
    verify_owner(input, state)?;
    match kind {
        "mergeDependencyCandidates" => dependencies::candidates(input),
        "mergeDependencyMissing" => dependencies::missing(input),
        "mergePatternDependencies" => dependencies::pattern(input),
        "mergePatternOutcome" => dependencies::outcome(input),
        "mergeResultsSelect" => selection::results(input),
        _ => Err(invalid("unsupported merge transaction policy")),
    }
}

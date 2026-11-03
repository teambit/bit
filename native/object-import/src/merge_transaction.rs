//! Owned `main`/lane merge policy ([`State`], [`apply`], [`prepare_with_workspace`], [`reads`]) and retained materialization lifecycle.
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
/// Session-scoped merge transaction state combining `journal`, `status`, and file `bodies`.
#[derive(Default)]
pub(crate) struct State {
    journal: journal::State,
    status: status::State,
    bodies: bodies::State,
}
/// Dispatches a merge transaction operation (`kind`) with `input` [`Value`] against session `state` ([`State`]).
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    let kind = kind.trim();
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
            let token = parse_token(&input, "merge finish token")?;
            let tokens = state.journal.finish(token)?;
            state.status.finish(&tokens);
            state.bodies.finish(&tokens)?;
            Ok(json!({"finished":true}))
        }
        _ => policy(kind, &input, &state.journal),
    }
}
/// Prepares component merge file bodies in `state` ([`State`]) using retained workspace `snapshots`.
pub(crate) fn prepare_with_workspace(
    input: Value,
    state: &mut State,
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<Value> {
    state.bodies.prepare(input, &state.journal, Some(snapshots))
}
/// Extracts and validates a non-empty `token` string (up to 256 bytes, no NULs) from `input`.
#[inline]
fn parse_token<'a>(input: &'a Value, message: &'static str) -> io::Result<&'a str> {
    input["token"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty() && val.len() <= 256 && !val.contains('\0'))
        .ok_or_else(|| invalid(message))
}
/// Verifies that `input` carries a valid component `token` and `index` (`< 4096`) in `state`.
#[inline]
fn verify(input: &Value, state: &journal::State) -> io::Result<()> {
    let token = parse_token(input, "merge owner token")?;
    let index = input["index"]
        .as_u64()
        .filter(|index| *index < 4096)
        .ok_or_else(|| invalid("merge component index"))? as usize;
    state.verify(token, index)
}
#[inline]
fn verify_owner(input: &Value, state: &journal::State) -> io::Result<()> {
    let token = parse_token(input, "merge owner token")?;
    if input["index"].as_u64() != Some(0) {
        return Err(invalid("merge operation index"));
    }
    state.verify_owner(token, 0)
}
#[inline]
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

pub(crate) fn prepare_with_overlay(
    input: Value,
    state: &mut State,
    snapshots: Option<&crate::workspace::snapshots::State>,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    state.bodies.prepare_overlay(input, &state.journal, snapshots, overlay)
}
pub(crate) fn apply_with_overlay(
    input: &Value,
    state: &mut State,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    state.bodies.apply_overlay(input, &state.journal, overlay)
}

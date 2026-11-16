//! `bit reset` history, dependent-index, candidate-selection, and phase-journal operations ([`apply`], [`State`], [`bound`], [`text`]).

pub(crate) use journal::State;

mod dependents;
mod history;
mod journal;
mod local;
mod selectors;
#[cfg(test)]
mod tests;

use serde_json::Value;
use std::io;

/// Dispatches a `bit reset` history or journal operation (`kind`) with `input` [`Value`] against session [`State`].
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    if !input.is_object() {
        return Err(invalid("history reset request"));
    }
    match kind.trim() {
        "historyResetBegin" => state.begin(input),
        "historyResetReceipt" => state.receipt(input),
        "historyResetFork" => state.fork(input),
        "historyResetFinish" => state.finish(input),
        "historyResetLocalAppend" => local::append(input),
        "historyResetLocalRead" => local::read(input),
        "historyResetLocalVersions" => local::select(input),
        "historyResetDependents" => dependents::index(input),
        "historyResetComponentPlan" => crate::recovery::reset(&input),
        "historyResetCandidates" => selectors::candidates(input),
        "historyResetPattern" => selectors::pattern(input),
        "historyResetSoft" => selectors::soft(input),
        "historyResetNeverExported" => selectors::never(input),
        "historyResetLaneHistory" => history::prune(input),
        _ => Err(invalid("unsupported history reset operation")),
    }
}
/// Constructs an `InvalidData` I/O error with `message`.
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
/// Rejects collection lengths exceeding the `4096`-record `bit reset` safety budget via [`invalid`].
#[inline]
fn bound(count: usize) -> io::Result<()> {
    if count > 4096 {
        return Err(invalid("history reset record limit"));
    }
    Ok(())
}
/// Validates that `value` is a non-empty, non-control string within the `32768`-byte reset limit.
#[inline]
fn text(value: &str) -> io::Result<()> {
    let has_control = if value.is_ascii() {
        value.bytes().any(|byte| byte.is_ascii_control())
    } else {
        value.chars().any(char::is_control)
    };
    if value.len() > 32768 || value.trim().is_empty() || has_control {
        return Err(invalid("history reset text"));
    }
    Ok(())
}

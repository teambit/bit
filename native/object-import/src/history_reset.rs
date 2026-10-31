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

pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
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
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn bound(count: usize) -> io::Result<()> {
    if count > 4096 {
        return Err(invalid("history reset record limit"));
    }
    Ok(())
}
fn text(value: &str) -> io::Result<()> {
    if value.trim().is_empty() || value.len() > 32768 || value.contains('\0') {
        return Err(invalid("history reset text"));
    }
    Ok(())
}

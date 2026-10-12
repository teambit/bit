//! Owned, read-only repository history queries. Public imports and errors remain adapter checkpoints.
pub(crate) use state::State;

mod artifacts;
mod bfs;
mod blame;
mod diff;
mod files;
mod lines;
mod populate;
mod show;
mod sources;
mod state;
#[cfg(test)]
mod tests;

use serde_json::Value;
use std::io;

pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
        "historyQueryToposort" => show::toposort(input),
        "historyQueryShow" => show::show(input),
        "historyQueryPopulateBegin" => state.populate_begin(input),
        "historyQueryBegin" => state.begin(input),
        "historyQueryDiff" => state.diff(input),
        "historyQueryBlame" => state.blame(input),
        "historyQueryFiles" => state.files(input),
        "historyQueryFinish" => state.finish(input),
        _ => Err(invalid("unsupported history query")),
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn reads(versions: (usize, usize), sources: (usize, usize), overlays: usize) -> Value {
    serde_json::json!({"versionObjects":versions.0,"versionInflatedBytes":versions.1,"sourceObjects":sources.0,"sourceBodyBytes":sources.1,"overlayVersions":overlays})
}

pub(crate) fn validate_version(value: &Value) -> io::Result<()> {
    artifacts::validate(value)?;
    crate::transfer::collection::shape::query(value)
}

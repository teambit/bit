//! Owned, read-only repository history queries. Public imports and errors remain adapter checkpoints.
pub(crate) mod populate;
pub(crate) use state::State;

mod artifacts;
mod bfs;
mod blame;
mod diff;
mod files;
mod lines;
mod show;
mod sources;
mod state;
#[cfg(test)]
mod tests;

use serde_json::Value;
use std::io;

pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind.trim() {
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

fn overlay_indices(overlays: &[Value]) -> std::collections::HashMap<String, usize> {
    let mut indices = std::collections::HashMap::new();
    for (index, value) in overlays.iter().enumerate() {
        if let Some(hash) = value
            .get("hash")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
        {
            indices.entry(hash.to_owned()).or_insert(index);
        }
    }
    indices
}

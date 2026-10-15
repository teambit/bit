//! The prepare receipt returned to the native CLI.
use super::Pending;
use serde_json::{Value, json};

pub(super) fn prepare(token: &str, count: usize, pending: &[Pending], lane: Option<&str>) -> Value {
    let object_count = pending
        .iter()
        .map(|batch| batch.objects.len())
        .sum::<usize>();
    json!({"token":token,"owner":"rust","nothingToExport":count == 0 && lane.is_none(),
        "lane":lane,
        "componentCount":count,
        "scopes":pending.iter().map(|batch| &batch.scope).collect::<Vec<_>>(),
        "scopeObjectCounts":pending.iter().map(|batch| batch.objects.len()).collect::<Vec<_>>(),
        "fileRemote":pending.iter().any(|batch| batch.host.starts_with("file://")),
        "objectCount":object_count})
}

//! The prepare receipt returned to the native CLI.
use super::{Pending, lane_model::ForkHistory};
use serde_json::{Value, json};

pub(super) fn prepare(
    token: &str,
    count: usize,
    pending: &[Pending],
    lane: Option<&str>,
    fork_history: Option<&ForkHistory>,
) -> Value {
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
        "forkHistory":fork_history.map(|history| json!({"parent":history.parent,"externalCount":history.external_count,"candidateCount":history.candidate_count})),
        "objectCount":object_count})
}

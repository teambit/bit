//! The [`prepare`] JSON receipt returned to the native CLI for [`Pending`] and [`ForkHistory`] outbound exports.

use super::{Pending, lane_model::ForkHistory};
use serde_json::{Value, json};

/// Builds the JSON preparation receipt summarizing [`Pending`] scope batches, object counts, `lane`, and optional [`ForkHistory`].
#[inline]
pub(super) fn prepare(
    token: &str,
    count: usize,
    pending: &[Pending],
    lane: Option<&str>,
    fork_history: Option<&ForkHistory>,
) -> Value {
    let lane = lane
        .map(str::trim)
        .filter(|name| !name.is_empty());
    let scope_object_counts = pending
        .iter()
        .map(|batch| batch.objects.len())
        .collect::<Vec<_>>();
    let object_count = scope_object_counts
        .iter()
        .copied()
        .fold(0_usize, usize::saturating_add);
    let file_remote = pending
        .iter()
        .any(|batch| {
            batch.host
                .trim()
                .get(..7)
                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("file://"))
        });
    let fork = fork_history
        .filter(|history| !history.parent.trim().is_empty())
        .map(|history| {
            json!({"parent":history.parent.trim(),"externalCount":history.external_count,"candidateCount":history.candidate_count})
        });
    json!({"token":token.trim(),"owner":"rust","nothingToExport":count == 0 && lane.is_none(),
        "lane":lane,
        "componentCount":count,
        "scopes":pending.iter().map(|batch| batch.scope.trim()).collect::<Vec<_>>(),
        "scopeObjectCounts":scope_object_counts,
        "fileRemote":file_remote,
        "forkHistory":fork,
        "objectCount":object_count})
}

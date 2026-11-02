//! `Rayon` thread-pool installation routing ([`run`], [`is_parallel`]) for parallel-eligible [`Request`] dispatch on [`State`].

use super::{Request, State, apply};
use serde_json::Value;
use std::io;
/// Dispatches `request` inside `pool` when parallel-eligible, or directly on the current thread.
#[inline]
pub(super) fn run(
    request: Request,
    state: &mut State,
    bytes: &[u8],
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    if is_parallel(&request) {
        pool.install(|| apply(request, state, bytes))
    } else {
        apply(request, state, bytes)
    }
}

/// Returns `true` when `request` is eligible to execute inside the `Rayon` worker pool.
#[inline]
const fn is_parallel(request: &Request) -> bool {
    matches!(
        request,
        Request::MergePrepare(_)
            | Request::MergeApply(_)
            | Request::CheckoutPrepare(_)
            | Request::HistoryResetBegin(_)
            | Request::SnapshotTransactionBegin(_)
            | Request::SnapshotRepositoryBegin(_)
            | Request::SnapshotSerialize(_)
            | Request::InspectionBegin(_)
            | Request::InspectionDiff(_)
            | Request::HistoryQueryBegin(_)
            | Request::HistoryQueryBlame(_)
            | Request::HistoryQueryDiff(_)
            | Request::TransferCollect(_),
    )
}

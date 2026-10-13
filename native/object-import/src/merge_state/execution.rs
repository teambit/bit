use super::{Request, State, apply};
use serde_json::Value;
use std::io;
pub(super) fn run(
    request: Request,
    state: &mut State,
    bytes: &[u8],
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    if matches!(
        &request,
        Request::MergePrepare(_)
            | Request::MergeApply(_)
            | Request::CheckoutPrepare(_)
            | Request::SnapshotSerialize(_)
            | Request::InspectionBegin(_)
            | Request::InspectionDiff(_)
            | Request::HistoryQueryDiff(_),
    ) {
        pool.install(|| apply(request, state, bytes))
    } else {
        apply(request, state, bytes)
    }
}

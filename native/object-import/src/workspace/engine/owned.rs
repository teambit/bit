//! Dispatch requests retaining command, inventory and status ownership.
use super::{
    super::snapshots, Request, apply, client_status, command, dependency_graph, inventory,
};
use serde_json::Value;
use std::io;

pub(super) fn owned_command(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::ReadSetValidate { proofs } => pool.install(|| validate_read_set(&proofs)),
        Request::CommandPlan(input) => pool.install(|| command::plan(&input, snapshots, pool)),
        Request::CommandMergeDeferSnapshot(input) => {
            command::merge_defer::run(&input, &mut snapshots.command)
        }
        Request::CommandCheckoutPolicyComplete(input) => {
            command::checkout_policy::complete(input, &mut snapshots.command)
        }
        Request::CommandPolicyPrepare(input) => {
            pool.install(|| command::policy::prepare(input, &mut snapshots.command))
        }
        Request::CommandDependencyDetect(input) => pool.install(|| {
            command::policy::dependencies::detect(input, &mut snapshots.command, pool)
        }),
        Request::CommandDependencyComplete(input) => pool.install(|| {
            command::policy::dependencies::complete(input, &mut snapshots.command, pool)
        }),
        Request::CommandLaneFinalize(input) => {
            pool.install(|| command::finalize_lane(&input, &mut snapshots.command))
        }
        Request::CommandFinalize(input) => {
            pool.install(|| command::finalize(&input, &mut snapshots.command))
        }
        Request::CommandSwitchComplete(input) => {
            command::switch_completion::complete(&input, &mut snapshots.command)
        }
        Request::CommandApply(input) => {
            pool.install(|| command::apply(&input, &mut snapshots.command))
        }
        Request::CommandCheckoutSelect(input) => {
            command::checkout_pattern::select(input, &mut snapshots.command)
        }
        Request::CommandPrepare(input) => {
            pool.install(|| command::prepare(input, &mut snapshots.command, pool))
        }
        request => owned_status_command(request, snapshots, pool),
    }
}
fn owned_status_command(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandLaneHistoryPrepare(input) => {
            command::lane_history::run(input, &mut snapshots.command)
        }

        Request::StatusPrepare(input) => client_status::prepare(input, &mut snapshots.status),
        Request::StatusScan(input) => client_status::scan(&input, &mut snapshots.status, pool),
        Request::StatusFinish(input) => client_status::finish(&input, &mut snapshots.status, pool),
        Request::StatusComplete => client_status::complete(&mut snapshots.status),
        Request::InventoryBegin(input) => inventory::begin(input, &mut snapshots.inventory, pool),
        Request::InventoryFinish(input) => inventory::finish(input, &mut snapshots.inventory, pool),
        Request::InventoryCancel { token } => inventory::cancel(token, &mut snapshots.inventory),
        request => apply(request, pool),
    }
}

fn validate_read_set(proofs: &[dependency_graph::proof::Proof]) -> io::Result<(usize, Value)> {
    let bytes: usize = proofs
        .iter()
        .map(|proof| proof.path.as_os_str().len())
        .sum();
    if proofs.len() > 16384 || bytes > super::MAX_RAW {
        return Err(super::invalid("read set proof count limit"));
    }
    dependency_graph::proof::verify(proofs)?;
    Ok((proofs.len(), serde_json::json!({"valid":true})))
}

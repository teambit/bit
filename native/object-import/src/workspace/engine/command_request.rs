//! Route inbound and outbound commands while retaining their shared request state.
use super::{Request, command, owned_command};
use crate::workspace::snapshots;
use serde_json::Value;
use std::io;

pub(super) fn dispatch(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandInboundPrepare(input) => {
            pool.install(|| command::inbound::prepare(&input, &mut snapshots.command))
        }
        Request::CommandInboundList(input) => pool.install(|| command::inbound::list(&input)),
        Request::CommandInboundApply(input) => {
            pool.install(|| command::inbound::apply(&input, &mut snapshots.command))
        }
        Request::StatusLaneUpdates(input) => {
            pool.install(|| command::inbound::lane_updates(&input, &snapshots.command, pool))
        }
        Request::CommandOutboundPrepare(input) => {
            pool.install(|| command::outbound::prepare(&input, &mut snapshots.command))
        }
        Request::CommandOutboundApply(input) => {
            pool.install(|| command::outbound::apply(&input, &mut snapshots.command))
        }
        Request::CommandOutboundFinalize(input) => {
            pool.install(|| command::outbound::finalize(&input, &mut snapshots.command))
        }
        request => owned_command(request, snapshots, pool),
    }
}

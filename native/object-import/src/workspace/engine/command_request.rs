//! Route inbound and outbound commands while retaining their shared request state.
use super::{Request, command};
use crate::workspace::snapshots;
use serde_json::Value;
use std::io;

pub(super) fn dispatch(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandLaneHistoryInspectPrepare(input) => {
            command::lane_history::inspection::prepare(&input, &mut snapshots.command)
        }
        Request::CommandLaneHistoryInspectApply(input) => {
            command::lane_history::inspection::apply(&input, &mut snapshots.command)
        }
        Request::CommandInboundLocalPreflight(input) => command::inbound::local_preflight(&input),
        Request::CommandInboundPrepare(input) => {
            pool.install(|| command::inbound::prepare(&input, &mut snapshots.command))
        }
        Request::CommandInboundCompleteDependents(input) => {
            command::inbound::dependents::complete(input, &mut snapshots.command)
        }
        Request::CommandInboundWriteDependencies(input) => {
            command::inbound::write_dependencies::complete(&input, &mut snapshots.command)
        }
        Request::CommandInboundPolicyComplete(input) => {
            command::inbound::policy::complete(input, &mut snapshots.command)
        }
        Request::CommandInboundList(input) => pool.install(|| command::inbound::list(&input)),
        Request::CommandRemoteInventory(input) => {
            pool.install(|| command::inbound::remote::inventory::read(&input))
        }
        Request::CommandInboundApply(input) => {
            pool.install(|| command::inbound::apply(&input, &mut snapshots.command))
        }
        Request::CommandAutoSyncFinalize(input) => {
            command::inbound::autosync::finalize(&input, &snapshots.command)
        }
        request => overlay_reads(request, snapshots, pool),
    }
}

fn overlay_reads(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::WorkspaceDiff(input) => super::status_models::workspace_diff::read_overlay(
            &input,
            pool,
            command::inbound::overlay(
                &snapshots.command,
                input.import_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|token| !token.is_empty()),
            )?,
        ),
        Request::VersionDiff(input) => super::status_models::version_diff::read_overlay(
            &input,
            pool,
            command::inbound::overlay(
                &snapshots.command,
                input.import_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|token| !token.is_empty()),
            )?,
        ),
        Request::VersionParentChain(input) => super::status_models::parent_diff::read_overlay(
            &input,
            pool,
            command::inbound::overlay(
                &snapshots.command,
                input.import_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|token| !token.is_empty()),
            )?,
        ),
        Request::StatusLaneUpdates(input) => {
            pool.install(|| command::inbound::lane_updates(&input, &snapshots.command, pool))
        }
        request => outbound(request, snapshots, pool),
    }
}

fn outbound(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandOutboundCandidates(input) => {
            command::outbound::candidates(&input).map(|value| (0, value))
        }
        Request::CommandOutboundPrepare(input) => {
            pool.install(|| command::outbound::prepare(&input, &mut snapshots.command))
        }
        Request::CommandOutboundApply(input) => {
            pool.install(|| command::outbound::apply(&input, &mut snapshots.command))
        }
        Request::CommandOutboundStage(input) => {
            pool.install(|| command::outbound::stage(&input, &mut snapshots.command))
        }
        Request::CommandOutboundFinalize(input) => {
            pool.install(|| command::outbound::finalize(&input, &mut snapshots.command))
        }
        request => super::snapshot_request::dispatch(request, snapshots, pool),
    }
}

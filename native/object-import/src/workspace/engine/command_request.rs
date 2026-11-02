//! Route inbound and outbound [`Request`] variants via [`dispatch`] on [`snapshots::State`].

use super::{Request, command};
use crate::workspace::snapshots;
use serde_json::Value;
use std::io;

/// Dispatches a command-domain [`Request`] variant against `snapshots` and `pool`.
#[inline]
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

/// Validates and trims an optional inbound import owner `token`.
#[inline]
fn import_token(token: Option<&str>) -> io::Result<Option<&str>> {
    let Some(candidate) = token
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    else {
        return Ok(None);
    };
    if candidate.len() > 256
        || candidate.chars().any(char::is_control)
        || candidate.contains(['/', '\\'])
    {
        return Err(super::invalid("command import token"));
    }
    Ok(Some(candidate))
}

/// Resolves the active inbound [`crate::command_import::Overlay`] on `state` for `token`, if any.
#[inline]
fn inbound_overlay<'a>(
    state: &'a command::State,
    token: Option<&str>,
) -> io::Result<Option<&'a crate::command_import::Overlay>> {
    command::inbound::overlay(state, import_token(token)?)
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
            inbound_overlay(&snapshots.command, input.import_token.as_deref())?,
        ),
        Request::VersionDiff(input) => super::status_models::version_diff::read_overlay(
            &input,
            pool,
            inbound_overlay(&snapshots.command, input.import_token.as_deref())?,
        ),
        Request::VersionParentChain(input) => super::status_models::parent_diff::read_overlay(
            &input,
            pool,
            inbound_overlay(&snapshots.command, input.import_token.as_deref())?,
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

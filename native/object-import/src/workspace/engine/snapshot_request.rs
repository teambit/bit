//! Route native snapshot callback [`Request`] phases via [`dispatch`] and [`dispatch_resolve`] before [`owned_command`].

use super::{super::snapshots, Request, command, owned_command};
use serde_json::Value;
use std::io;

/// Dispatches stash and resolve snapshot callback `request` ([`Request`]) phases against `snapshots` ([`snapshots::State`]).
///
/// Unhandled `request` variants fall through to [`dispatch_resolve`] and [`owned_command`].
#[inline]
pub(super) fn dispatch(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let state = &mut snapshots.command;
    match request {
        Request::CommandStashPrepare(input) => command::stash::prepare(input, state, pool),
        Request::CommandStashPlan(input) => command::stash::plan(input, snapshots, pool),
        Request::CommandStashStageHistory(input) => {
            command::stash::stage_history(&input, state, pool)
        }
        Request::CommandStashFinalize(input) => {
            pool.install(|| command::stash::finalize(&input, snapshots))
        }
        Request::CommandStashStageGraph(input) => command::stash::stage_graph(&input, state),
        Request::CommandStashPersist(input) => command::stash::persist(&input, state),
        request => dispatch_resolve(request, snapshots, pool),
    }
}

/// Dispatches snapshot package, build, validation, and tag callback `request` ([`Request`]) phases against `snapshots` ([`snapshots::State`]).
/// Unhandled `request` variants delegate to [`owned_command`].
#[inline]
fn dispatch_resolve(
    request: Request,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let state = &mut snapshots.command;
    match request {
        Request::CommandSnapshotStagePackages(input) => {
            command::resolve::stage_packages(&input, state)
        }
        Request::CommandSnapshotPackageFinalize(input) => {
            pool.install(|| command::resolve::package_finalize(input, state))
        }
        Request::CommandSnapshotStageBuild(input) => command::resolve::stage_build(&input, state),
        Request::CommandSnapshotBuildFinalize(input) => {
            pool.install(|| command::resolve::build_finalize(input, snapshots))
        }
        Request::CommandSnapshotValidate(input) => {
            command::resolve::validate_snapshot(&input, state)
        }
        Request::CommandSnapshotRefresh(input) => {
            pool.install(|| command::resolve::refresh_snapshot(input, snapshots, pool))
        }
        Request::CommandTagVersionOverrides(input) => {
            command::resolve::override_versions(&input, state)
        }
        Request::CommandTagCandidates(input) => {
            pool.install(|| command::resolve::tag_candidates(input, snapshots, pool))
        }
        request => owned_command(request, snapshots, pool),
    }
}

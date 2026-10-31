//! Route native snapshot callback phases before general command execution.
use super::{Request, command, owned_command};
use crate::workspace::snapshots;
use serde_json::Value;
use std::io;

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
        Request::CommandStashFinalize(input) => command::stash::finalize(&input, snapshots),
        Request::CommandStashStageGraph(input) => command::stash::stage_graph(&input, state),
        Request::CommandStashPersist(input) => command::stash::persist(&input, state),
        request => dispatch_resolve(request, snapshots, pool),
    }
}

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
            command::resolve::package_finalize(input, state)
        }
        Request::CommandSnapshotStageBuild(input) => command::resolve::stage_build(&input, state),
        Request::CommandSnapshotBuildFinalize(input) => {
            pool.install(|| command::resolve::build_finalize(input, snapshots))
        }
        Request::CommandSnapshotValidate(input) => {
            command::resolve::validate_snapshot(&input, state)
        }
        Request::CommandSnapshotRefresh(input) => {
            command::resolve::refresh_snapshot(input, snapshots, pool)
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

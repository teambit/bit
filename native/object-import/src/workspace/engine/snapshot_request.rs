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
    match request {
        Request::CommandSnapshotStagePackages(input) => {
            command::resolve::stage_packages(&input, &mut snapshots.command)
        }
        Request::CommandSnapshotPackageFinalize(input) => {
            command::resolve::package_finalize(input, &mut snapshots.command)
        }
        Request::CommandSnapshotStageBuild(input) => {
            command::resolve::stage_build(&input, &mut snapshots.command)
        }
        Request::CommandSnapshotBuildFinalize(input) => {
            command::resolve::build_finalize(input, snapshots)
        }
        Request::CommandSnapshotValidate(input) => {
            command::resolve::validate_snapshot(&input, &mut snapshots.command)
        }
        Request::CommandSnapshotRefresh(input) => {
            command::resolve::refresh_snapshot(input, snapshots, pool)
        }
        Request::CommandTagVersionOverrides(input) => {
            command::resolve::override_versions(&input, &mut snapshots.command)
        }

        Request::CommandTagCandidates(input) => {
            pool.install(|| command::resolve::tag_candidates(input, snapshots, pool))
        }
        request => owned_command(request, snapshots, pool),
    }
}

pub(crate) mod client_status;
pub(crate) mod command;
pub(crate) mod dependency_policy;
pub(crate) mod diff;
pub(crate) mod inventory;
pub(crate) mod read_dependency_cache;

pub use status_context::configuration::effective as effective_workspace_configuration;

mod command_request;
mod dependency_graph;
mod owned;
mod read;
use owned::owned_command;
mod read_raw;
#[cfg(test)]
mod request_tests;
mod resolve_dependencies;
mod resolve_typescript;
mod response;
mod scan;
mod snapshot_request;
mod source_overlay;
mod status;
mod status_context;
mod status_graph;
mod status_history;
mod status_models;
mod status_result;
mod validation;

use crate::protocol;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    io::{self, Read, Write},
    path::PathBuf,
};
use validation::{count, expected_hash, hash, invalid, path};

const MAX_INPUT: usize = 4 * 1024 * 1024;
const MAX_OUTPUT: usize = 32 * 1024 * 1024;
const MAX_RAW: usize = 8 * 1024 * 1024;
const MAX_FILES: usize = 4096;

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    DependencyPolicyCached(Box<dependency_policy::cached::Request>),
    DependencyDetectFresh(Box<dependency_policy::fresh::Detect>),
    DependencyPolicyDetected(Box<dependency_policy::fresh::Complete>),
    DependencyFreshValidate(dependency_graph::proof::Request),
    StatusHistoryValidate(status_history::Request),
    StatusHistoryCommit(status_history::Request),
    DependencyPolicyComplete(Box<dependency_policy::pipeline::Request>),
    DependencyPolicyPackages(dependency_policy::packages_on_disk::Request),
    DependencyPolicy(Box<dependency_policy::Request>),
    DependencyPolicyFinish(Box<dependency_policy::finalize::Request>),
    DependencyPolicyVersions(Box<dependency_policy::versions::Request>),
    DependencyCacheRead(read_dependency_cache::Read),
    DependencyCacheFreshness(read_dependency_cache::Freshness),
    DependencyResolve(resolve_dependencies::Request),
    DependencyGraph(dependency_graph::Request),
    DependencyScan {
        request: Value,
    },
    ReadSetValidate {
        proofs: Vec<dependency_graph::proof::Proof>,
    },
    CommandStashPrepare(command::stash::Prepare),
    CommandStashPlan(command::stash::Plan),
    CommandStashStageHistory(command::stash::StageHistory),
    CommandStashFinalize(command::stash::Finalize),
    CommandStashStageGraph(command::stash::Persist),
    CommandStashPersist(command::stash::Persist),
    CommandPrepare(command::input::Prepare),
    CommandCheckoutSelect(command::checkout_pattern::Request),
    CommandInboundPrepare(command::inbound::Prepare),
    CommandInboundList(command::inbound::List),
    CommandInboundApply(command::inbound::Apply),
    CommandInboundPolicyComplete(command::inbound::policy::Complete),
    CommandAutoSyncFinalize(command::inbound::autosync::Request),
    StatusLaneUpdates(status_models::lane_updates::Request),
    CommandOutboundCandidates(command::outbound::Candidates),
    CommandOutboundPrepare(command::outbound::Prepare),
    CommandOutboundApply(command::outbound::Apply),
    CommandOutboundStage(command::outbound::Finalize),
    CommandOutboundFinalize(command::outbound::Finalize),
    CommandTagPrepare(command::resolve::Prepare),
    CommandTagPlan(command::resolve::Plan),
    CommandTagVersionOverrides(command::resolve::TagOverrides),
    CommandTagCandidates(command::resolve::Plan),
    CommandTagFinalize(command::resolve::Finalize),
    CommandTagApply(command::resolve::Apply),
    CommandSnapPrepare(command::resolve::Prepare),
    CommandSnapPlan(command::resolve::Plan),
    CommandSnapshotValidate(command::resolve::Validate),
    CommandSnapshotRefresh(command::resolve::Refresh),
    CommandSnapshotStagePackages(command::resolve::StagePackages),
    CommandSnapshotPackageFinalize(command::resolve::PackageFinalize),
    CommandSnapshotStageBuild(command::resolve::StageBuild),
    CommandSnapshotBuildFinalize(command::resolve::BuildFinalize),
    CommandSnapFinalize(command::resolve::Finalize),
    CommandSnapApply(command::resolve::Apply),
    CommandResolvePrepare(command::resolve::Prepare),
    CommandResolvePlan(command::resolve::Plan),
    CommandResolveFinalize(command::resolve::Finalize),
    CommandResolveApply(command::resolve::Apply),
    CommandRecoveryPrepare(command::recovery::Prepare),
    CommandRecoveryPlan(command::recovery::Plan),
    CommandRecoveryApply(command::recovery::Apply),
    CommandRecoveryRestore(command::recovery::Restore),
    CommandPlan(command::Plan),
    CommandMergeDeferSnapshot(command::merge_defer::Request),
    CommandCheckoutPolicyComplete(command::checkout_policy::Complete),
    CommandPolicyPrepare(command::policy::Prepare),
    CommandDependencyDetect(command::policy::dependencies::Detect),
    CommandDependencyComplete(command::policy::dependencies::Complete),
    CommandApply(command::Apply),
    CommandFinalize(command::Finalize),
    CommandLaneFinalize(command::LaneFinalize),
    StatusContext(status_context::Request),
    TrackingContext(status_context::tracking::Request),
    StatusGraph(status_graph::Request),
    StatusResult(status_result::Request),
    StatusModels(status_models::Request),
    ScopeList(status_models::list::Request),
    LaneList(status_models::list::Lanes),
    HttpLaneList(status_models::list::http_lanes::Request),
    StatusCompare(status_models::comparison::Request),
    WorkspaceDiff(status_models::workspace_diff::Request),
    VersionDiff(status_models::version_diff::Request),
    VersionParentChain(status_models::parent_diff::Request),
    ComponentLog(status_models::component_log::Request),
    RemoteComponentLog(command::inbound::RemoteLog),
    ComponentFileHistory(status_models::file_history::Request),
    StatusPrepare(client_status::Prepare),
    StatusScan(client_status::Scan),
    StatusFinish(client_status::Finish),
    StatusComplete,
    InventoryBegin(inventory::Begin),
    InventoryFinish(inventory::Finish),
    InventoryCancel {
        token: u64,
    },
    Scan {
        root: PathBuf,
        exclude_dirs: Vec<PathBuf>,
        workspace_root: bool,
    },
    Read {
        files: Vec<PathBuf>,
        #[serde(default)]
        binary: bool,
        #[serde(default)]
        retain: bool,
    },
    Diff {
        files: Vec<diff::InputFile>,
        git_executable: String,
        color: bool,
    },
    FileStatus {
        target: Vec<status::File>,
        current: Vec<status::File>,
    },
    Compare {
        left: String,
        right: String,
    },
}

#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    completed: usize,
    skipped: Vec<usize>,
    failed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    /// Why a request failed, for diagnostics; callers decide on `failed`.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "canonicalError", skip_serializing_if = "Option::is_none")]
    canonical_error: Option<bool>,
}
use response::Output;

/// Read-only workspace operations return no partial results on unsupported data.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    pool: &rayon::ThreadPool,
    snapshots: &mut super::snapshots::State,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_INPUT {
        return Err(invalid("workspace input limit"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let request = serde_json::from_slice(&bytes).map_err(|_| invalid("workspace invalid request"));
    if let Ok(Request::Read { files, binary: true, retain }) = &request {
        return read_raw::respond(id, files, pool, writer, retain.then_some(snapshots));
    }
    let result = request.and_then(|request| owned(request, snapshots, pool));
    let response = match result {
        Ok((completed, data)) => Response {
            version: 1,
            id,
            completed,
            skipped: Vec::new(),
            failed: false,
            data: Some(data),
            error: None,
            canonical_error: None,
        },
        Err(error) => Response {
            error: Some(error.to_string()),
            canonical_error: response::is_canonical(&error).then_some(true),
            ..failure(id)
        },
    };
    let mut output = Output(Vec::new());
    if serde_json::to_writer(&mut output, &response).is_err() {
        return protocol::respond(writer, &failure(id));
    }
    writer.write_all(&output.0)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
fn owned(
    request: Request,
    snapshots: &mut super::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandTagPrepare(input) => {
            pool.install(|| command::resolve::prepare_tag(input, &mut snapshots.command, pool))
        }

        Request::CommandSnapPrepare(input) => {
            pool.install(|| command::resolve::prepare_snap(input, &mut snapshots.command, pool))
        }

        Request::CommandResolvePrepare(input) => {
            pool.install(|| command::resolve::prepare(&input, &mut snapshots.command, pool))
        }
        Request::CommandResolvePlan(input)
        | Request::CommandSnapPlan(input)
        | Request::CommandTagPlan(input) => {
            pool.install(|| command::resolve::plan(input, snapshots, pool))
        }
        Request::CommandResolveFinalize(input)
        | Request::CommandSnapFinalize(input)
        | Request::CommandTagFinalize(input) => {
            pool.install(|| command::resolve::finalize(input, snapshots))
        }
        Request::CommandResolveApply(input)
        | Request::CommandSnapApply(input)
        | Request::CommandTagApply(input) => {
            pool.install(|| command::resolve::apply(&input, &mut snapshots.command))
        }
        Request::CommandRecoveryPrepare(input) => {
            pool.install(|| command::recovery::prepare(&input, &mut snapshots.command, pool))
        }
        Request::CommandRecoveryPlan(input) => {
            pool.install(|| command::recovery::plan(input, snapshots, pool))
        }
        Request::CommandRecoveryRestore(input) => {
            pool.install(|| command::recovery::restore(&input, &mut snapshots.command))
        }
        Request::CommandRecoveryApply(input) => {
            pool.install(|| command::recovery::apply(&input, &mut snapshots.command))
        }
        request => command_request::dispatch(request, snapshots, pool),
    }
}
fn failure(id: u32) -> Response {
    Response {
        version: 1,
        id,
        completed: 0,
        skipped: Vec::new(),
        failed: true,
        data: None,
        error: None,
        canonical_error: None,
    }
}
fn apply(request: Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    match request {
        Request::StatusContext(request) => status_context::read(&request, pool),
        Request::TrackingContext(request) => status_context::tracking::read(&request, pool),
        Request::StatusGraph(request) => status_graph::read(&request),
        Request::StatusResult(request) => status_result::read(&request),
        Request::StatusModels(request) => status_models::read(&request, pool),
        Request::ScopeList(request) => status_models::list::read(&request, pool),
        Request::LaneList(request) => status_models::list::lanes(&request),
        Request::HttpLaneList(request) => status_models::list::http_lanes::read(&request),
        Request::StatusCompare(request) => status_models::comparison::read(&request, pool),
        Request::WorkspaceDiff(request) => status_models::workspace_diff::read(&request, pool),
        Request::VersionDiff(request) => status_models::version_diff::read(&request, pool),
        Request::VersionParentChain(request) => status_models::parent_diff::read(&request, pool),
        Request::ComponentLog(request) => status_models::component_log::read(&request, pool),
        Request::RemoteComponentLog(request) => command::inbound::remote_log(&request),
        Request::ComponentFileHistory(request) => status_models::file_history::read(&request, pool),
        Request::Scan { root, exclude_dirs, workspace_root } => {
            let paths = scan::scan(&root, &exclude_dirs, workspace_root)?;
            Ok((paths.len(), json!({"paths":paths})))
        }
        Request::Read { files, .. } => {
            let files = read::read(&files, pool)?;
            Ok((files.len(), json!({"files":files})))
        }
        Request::Diff { files, git_executable, color } => {
            let files = pool.install(|| diff::diff(&files, &git_executable, color))?;
            Ok((files.len(), json!({"files":files})))
        }
        Request::FileStatus { target, current } => status::compare(&target, &current),
        Request::Compare { left, right } => Ok((
            1,
            json!({"modified":Sha1::digest(left.as_bytes())!=Sha1::digest(right.as_bytes())}),
        )),
        request => dependencies(request, pool),
    }
}
fn dependencies(request: Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    match request {
        Request::DependencyDetectFresh(request) => dependency_policy::fresh::detect(&request, pool),
        Request::DependencyPolicyDetected(request) => {
            dependency_policy::fresh::apply(&request, pool)
        }
        Request::StatusHistoryValidate(request) => {
            pool.install(|| status_history::validate(&request))
        }
        Request::StatusHistoryCommit(request) => pool.install(|| status_history::commit(&request)),
        Request::DependencyFreshValidate(request) => {
            pool.install(|| dependency_graph::proof::apply(&request))
        }
        Request::DependencyPolicyCached(request) => {
            dependency_policy::cached::apply(&request, pool)
        }
        Request::DependencyPolicyComplete(request) => {
            dependency_policy::pipeline::apply(&request, pool)
        }
        Request::DependencyPolicyPackages(request) => {
            dependency_policy::packages_on_disk::read(&request, pool)
        }
        Request::DependencyPolicy(request) => dependency_policy::apply(&request),
        Request::DependencyPolicyFinish(request) => dependency_policy::finalize::apply(&request),
        Request::DependencyPolicyVersions(request) => dependency_policy::versions::apply(&request),
        Request::DependencyCacheRead(request) => read_dependency_cache::read(&request),
        Request::DependencyCacheFreshness(request) => {
            read_dependency_cache::freshness(&request, pool)
        }
        Request::DependencyResolve(request) => resolve_dependencies::resolve(&request, pool),
        Request::DependencyGraph(request) => dependency_graph::apply(&request, pool),
        Request::DependencyScan { request } => dependency_graph::scan_request(&request, pool),
        Request::StatusPrepare(_)
        | Request::StatusScan(_)
        | Request::StatusFinish(_)
        | Request::StatusComplete
        | Request::InventoryBegin(_)
        | Request::InventoryFinish(_)
        | Request::InventoryCancel { .. } => Err(invalid("inventory operation requires an owner")),
        _ => Err(invalid("unsupported dependency operation")),
    }
}
#[cfg(test)]
mod tests;

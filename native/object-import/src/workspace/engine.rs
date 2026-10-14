pub(crate) mod client_status;
pub(crate) mod command;
pub(crate) mod dependency_policy;
pub(crate) mod diff;
pub(crate) mod inventory;

mod dependency_graph;
mod read;
mod read_dependency_cache;
mod read_raw;
mod resolve_dependencies;
mod resolve_typescript;
mod scan;
mod source_overlay;
mod status;
mod status_context;
mod status_history;
mod status_models;
mod status_result;

use crate::protocol;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

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
    CommandPrepare(command::input::Prepare),
    CommandRecoveryPrepare(command::recovery::Prepare),
    CommandRecoveryPlan(command::recovery::Plan),
    CommandRecoveryApply(command::recovery::Apply),
    CommandRecoveryRestore(command::recovery::Restore),
    CommandPlan(command::Plan),
    CommandPolicyPrepare(command::policy::Prepare),
    CommandDependencyDetect(command::policy::dependencies::Detect),
    CommandDependencyComplete(command::policy::dependencies::Complete),
    CommandApply(command::Apply),
    CommandFinalize(command::Finalize),
    CommandLaneFinalize(command::LaneFinalize),
    StatusContext(status_context::Request),
    StatusResult(status_result::Request),
    StatusModels(status_models::Request),
    StatusCompare(status_models::comparison::Request),
    WorkspaceDiff(status_models::workspace_diff::Request),
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
}
struct Output(Vec<u8>);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > MAX_OUTPUT {
            return Err(invalid("workspace output limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

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
        },
        Err(_) => failure(id),
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
        request => owned_command(request, snapshots, pool),
    }
}
fn owned_command(
    request: Request,
    snapshots: &mut super::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    match request {
        Request::CommandPlan(input) => command::plan(input, snapshots, pool),
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
        Request::CommandApply(input) => {
            pool.install(|| command::apply(&input, &mut snapshots.command))
        }
        Request::CommandPrepare(input) => {
            pool.install(|| command::prepare(input, &mut snapshots.command, pool))
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
fn failure(id: u32) -> Response {
    Response { version: 1, id, completed: 0, skipped: Vec::new(), failed: true, data: None }
}
fn apply(request: Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    match request {
        Request::StatusContext(request) => status_context::read(&request, pool),
        Request::StatusResult(request) => status_result::read(&request),
        Request::StatusModels(request) => status_models::read(&request, pool),
        Request::StatusCompare(request) => status_models::comparison::read(&request, pool),
        Request::WorkspaceDiff(request) => status_models::workspace_diff::read(&request, pool),
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
        Request::DependencyScan { request } => dependency_scan(&request, pool),
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
fn dependency_scan(request: &Value, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    let input = serde_json::to_string(request).map_err(io::Error::other)?;
    let output = bit_dependency_scanner::scan_request(&input, pool).map_err(io::Error::other)?;
    let count = output["files"]
        .as_array()
        .ok_or_else(|| invalid("dependency scan declined"))?
        .len();
    Ok((count, output))
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn path(path: &Path) -> io::Result<()> {
    let name = path.to_str().ok_or_else(|| invalid("workspace non-UTF8 path"))?;
    if !path.is_absolute() || name.len() > 32768 || name.contains('\0') {
        return Err(invalid("workspace invalid absolute path"));
    }
    Ok(())
}
fn count(count: usize) -> io::Result<()> {
    if count > MAX_FILES { Err(invalid("workspace file count limit")) } else { Ok(()) }
}
fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
fn expected_hash(hash: &str) -> io::Result<[u8; 20]> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("workspace invalid hash"));
    }
    let mut output = [0; 20];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hash[index * 2..index * 2 + 2], 16)
            .map_err(|_| invalid("workspace invalid hash"))?;
    }
    Ok(output)
}
#[cfg(test)]
mod tests;

pub(crate) mod write;
pub(crate) use state::State;

mod lane;
mod messages;
mod rebase;
mod reconcile;
mod squash;
mod state;

use crate::protocol;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    path::PathBuf,
};

const MAX_JSON: usize = 4 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    HistoryQueryBegin(Value),
    HistoryQueryFiles(Value),
    HistoryQueryBlame(Value),
    HistoryQueryDiff(Value),
    HistoryQueryFinish(Value),
    HistoryQueryPopulateBegin(Value),
    HistoryQueryShow(Value),
    HistoryQueryToposort(Value),
    HistoryResetBegin(Value),
    HistoryResetReceipt(Value),
    HistoryResetFork(Value),
    HistoryResetFinish(Value),
    HistoryResetLocalAppend(Value),
    HistoryResetLocalRead(Value),
    HistoryResetLaneHistory(Value),
    HistoryResetLocalVersions(Value),
    HistoryResetDependents(Value),
    HistoryResetComponentPlan(Value),
    HistoryResetCandidates(Value),
    HistoryResetPattern(Value),
    HistoryResetSoft(Value),
    HistoryResetNeverExported(Value),
    CheckoutSelectBegin(Value),
    CheckoutSelectReceipt(Value),
    CheckoutApplyDecision(Value),
    CheckoutPrepare(Value),
    CheckoutRemovals(Value),
    CheckoutApply(Value),
    CheckoutMaterialize(Value),
    CheckoutFinish(Value),
    InspectionBegin(Value),
    InspectionFiles(Value),
    InspectionCompare(Value),
    InspectionDiff(Value),
    InspectionFinish(Value),
    TransferCollect(Value),
    TransferInitialize(Value),
    TransferArchive(Value),
    TransferRelease(Value),
    TransferPending(Value),
    TransferTransactionInitialize(Value),
    TransferTransactionReceipt(Value),
    SnapshotTransactionBegin(Value),
    SnapshotRepositoryBegin(Value),
    SnapshotTransactionReceipt(Value),
    SnapshotRepositoryReceipt(Value),
    SnapshotVersionIdentity(Value),
    SnapshotDependencyUpdates(Value),
    SnapshotAutoTag(Value),
    SnapshotFutureVersions(Value),
    SnapshotSerialize(Value),
    SnapshotCommit(Value),
    ResetRefsPlan(Value),
    RecoveryInitialize { operations: Vec<crate::recovery::Operation> },
    RecoveryAdvance { token: String, count: usize },
    RecoveryBitmap { path: PathBuf, current_root_dirs: Vec<String> },
    ConfigScopePolicy(Value),
    ConfigWorkspaceConflictPlan(Value),
    ConfigWorkspaceConflictCommit(Value),
    ConfigComponent(Value),
    ConfigWorkspaceMerge(Value),
    ConfigWorkspaceUpdates(Value),
    SquashPolicy(squash::Policy),
    SquashMessages { objects_directory: PathBuf, refs: Vec<String> },
    HistoryRebase { existing_hashes: Vec<String>, incoming: Vec<rebase::Version> },
    LaneSnap(lane::Plan),
    ReconcileSnap(reconcile::Plan),
    Initialize { entries: Vec<Value> },
    Transition { token: String, revision: u32, action: state::Action },
    Commit { token: String, revision: u32, path: PathBuf, contents: String },
}
/// A helper owns one bounded pending merge list and verifies each transition token.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    state: &mut State,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_JSON {
        return Err(invalid("merge state request budget"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let output_limit = if serde_json::from_slice::<Value>(&bytes)
        .ok()
        .is_some_and(|input| {
            matches!(
                input["kind"].as_str(),
                Some("inspectionDiff" | "historyQueryBlame" | "historyQueryDiff"),
            )
        }) {
        32 * 1024 * 1024
    } else {
        MAX_JSON
    };
    let result = serde_json::from_slice(&bytes)
        .map_err(io::Error::other)
        .and_then(|request| apply(request, state, &bytes));
    let response = match result {
        Ok(data) => {
            json!({"version":1,"id":id,"completed":1,"skipped":[],"failed":false,"data":data})
        }
        Err(_) => json!({"version":1,"id":id,"completed":0,"skipped":[],"failed":true}),
    };
    let mut output = Output(Vec::new(), output_limit);
    if serde_json::to_writer(&mut output, &response).is_err() {
        return protocol::respond(
            writer,
            &json!({"version":1,"id":id,"completed":0,"skipped":[],"failed":true}),
        );
    }
    writer.write_all(&output.0)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
struct Output(Vec<u8>, usize);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > self.1 {
            return Err(invalid("merge state output budget"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn apply(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    match request {
        Request::SquashPolicy(input) => squash::policy(&input),
        Request::SquashMessages { objects_directory, refs } => {
            messages::read(&objects_directory, &refs)
        }
        Request::HistoryRebase { existing_hashes, incoming } => {
            rebase::plan(&existing_hashes, &incoming)
        }
        Request::LaneSnap(input) => lane::plan(&input),
        Request::ReconcileSnap(input) => reconcile::plan(&input),
        Request::Initialize { entries } => state.initialize(entries, bytes),
        Request::Transition { token, revision, action } => {
            state.verify(&token, revision)?;
            state.transition(action, bytes)
        }
        Request::Commit { token, revision, path, contents } => {
            state.verify(&token, revision)?;
            state.contents(&contents)?;
            write::commit(&path, &contents)?;
            Ok(json!({"saved":true}))
        }
        Request::InspectionBegin(input) => {
            crate::inspection::apply("inspectionBegin", input, &mut state.inspection)
        }
        Request::InspectionFiles(input) => {
            crate::inspection::apply("inspectionFiles", input, &mut state.inspection)
        }
        Request::InspectionCompare(input) => {
            crate::inspection::apply("inspectionCompare", input, &mut state.inspection)
        }
        Request::InspectionDiff(input) => {
            crate::inspection::apply("inspectionDiff", input, &mut state.inspection)
        }
        Request::InspectionFinish(input) => {
            crate::inspection::apply("inspectionFinish", input, &mut state.inspection)
        }
        request => query_operation(request, state, bytes),
    }
}
fn query_operation(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    let (kind, input) = match request {
        Request::HistoryQueryBegin(input) => ("historyQueryBegin", input),
        Request::HistoryQueryFiles(input) => ("historyQueryFiles", input),
        Request::HistoryQueryBlame(input) => ("historyQueryBlame", input),
        Request::HistoryQueryDiff(input) => ("historyQueryDiff", input),
        Request::HistoryQueryFinish(input) => ("historyQueryFinish", input),
        Request::HistoryQueryPopulateBegin(input) => ("historyQueryPopulateBegin", input),
        Request::HistoryQueryShow(input) => ("historyQueryShow", input),
        Request::HistoryQueryToposort(input) => ("historyQueryToposort", input),
        request => return history_operation(request, state, bytes),
    };
    crate::history_query::apply(kind, input, &mut state.operations.history_query)
}
fn history_operation(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    let (kind, input) = match request {
        Request::HistoryResetLocalRead(input) => ("historyResetLocalRead", input),
        Request::HistoryResetLaneHistory(input) => ("historyResetLaneHistory", input),
        Request::HistoryResetBegin(input) => ("historyResetBegin", input),
        Request::HistoryResetReceipt(input) => ("historyResetReceipt", input),
        Request::HistoryResetFork(input) => ("historyResetFork", input),
        Request::HistoryResetFinish(input) => ("historyResetFinish", input),
        Request::HistoryResetLocalAppend(input) => ("historyResetLocalAppend", input),
        Request::HistoryResetLocalVersions(input) => ("historyResetLocalVersions", input),
        Request::HistoryResetDependents(input) => ("historyResetDependents", input),
        Request::HistoryResetComponentPlan(input) => ("historyResetComponentPlan", input),
        Request::HistoryResetCandidates(input) => ("historyResetCandidates", input),
        Request::HistoryResetPattern(input) => ("historyResetPattern", input),
        Request::HistoryResetSoft(input) => ("historyResetSoft", input),
        Request::HistoryResetNeverExported(input) => ("historyResetNeverExported", input),
        request => return checkout_operation(request, state, bytes),
    };
    crate::history_reset::apply(kind, input, &mut state.operations.history_reset)
}
fn checkout_operation(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    let (kind, input) = match request {
        Request::CheckoutSelectBegin(input) => ("checkoutSelectBegin", input),
        Request::CheckoutSelectReceipt(input) => ("checkoutSelectReceipt", input),
        Request::CheckoutApplyDecision(input) => ("checkoutApplyDecision", input),
        Request::CheckoutRemovals(input) => ("checkoutRemovals", input),
        Request::CheckoutPrepare(input) => ("checkoutPrepare", input),
        Request::CheckoutApply(input) => ("checkoutApply", input),
        Request::CheckoutMaterialize(input) => ("checkoutMaterialize", input),
        Request::CheckoutFinish(input) => ("checkoutFinish", input),
        request => return metadata(request, state, bytes),
    };
    crate::checkout_transition::apply(kind, input, &mut state.operations.checkout_transition)
}

fn metadata(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    match request {
        Request::ResetRefsPlan(input) => crate::recovery::reset(&input),
        Request::RecoveryInitialize { operations } => state.recovery.initialize(operations, bytes),
        Request::RecoveryAdvance { token, count } => state.recovery.advance(&token, count),
        Request::RecoveryBitmap { path, current_root_dirs } => {
            crate::recovery::bitmap(&path, &current_root_dirs)
        }
        Request::ConfigScopePolicy(input) => {
            crate::config_merge::apply("configScopePolicy", &input)
        }
        Request::ConfigWorkspaceConflictPlan(input) => config_plan(&input, state),
        Request::ConfigWorkspaceConflictCommit(input) => {
            crate::config_merge::conflict_commit(&input, &mut state.conflict_plan)
        }
        Request::ConfigComponent(input) => crate::config_merge::apply("configComponent", &input),
        Request::ConfigWorkspaceMerge(input) => {
            crate::config_merge::apply("configWorkspaceMerge", &input)
        }
        Request::ConfigWorkspaceUpdates(input) => {
            crate::config_merge::apply("configWorkspaceUpdates", &input)
        }
        request @ (Request::TransferCollect(_)
        | Request::TransferInitialize(_)
        | Request::TransferArchive(_)
        | Request::TransferRelease(_)
        | Request::TransferPending(_)
        | Request::TransferTransactionInitialize(_)
        | Request::TransferTransactionReceipt(_)) => {
            transfer_request(request, &mut state.operations.transfer)
        }
        request => snapshot_operation(request, state),
    }
}

fn snapshot_operation(request: Request, state: &mut State) -> io::Result<Value> {
    let (kind, input) = match request {
        Request::SnapshotTransactionBegin(input) => ("snapshotTransactionBegin", input),
        Request::SnapshotRepositoryBegin(input) => ("snapshotRepositoryBegin", input),
        Request::SnapshotTransactionReceipt(input) => ("snapshotTransactionReceipt", input),
        Request::SnapshotRepositoryReceipt(input) => ("snapshotRepositoryReceipt", input),
        Request::SnapshotVersionIdentity(input) => ("snapshotVersionIdentity", input),
        Request::SnapshotFutureVersions(input) => ("snapshotFutureVersions", input),
        Request::SnapshotDependencyUpdates(input) => ("snapshotDependencyUpdates", input),
        Request::SnapshotAutoTag(input) => ("snapshotAutoTag", input),
        Request::SnapshotSerialize(input) => ("snapshotSerialize", input),
        Request::SnapshotCommit(input) => ("snapshotCommit", input),
        _ => return Err(invalid("invalid metadata operation")),
    };
    crate::snapshot_transaction::apply(kind, input, &mut state.snapshot)
}

fn config_plan(input: &Value, state: &mut State) -> io::Result<Value> {
    let (output, pending) = crate::config_merge::conflict_plan(input)?;
    state.conflict_plan = Some(pending);
    Ok(output)
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn hash(hash: &str) -> io::Result<()> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("invalid merge state hash"));
    }
    Ok(())
}
#[cfg(test)]
mod config_tests;
#[cfg(test)]
mod squash_tests;
#[cfg(test)]
mod tests;

fn transfer_request(request: Request, state: &mut crate::transfer::State) -> io::Result<Value> {
    match request {
        Request::TransferCollect(input) => crate::transfer::apply("transferCollect", &input, state),
        Request::TransferInitialize(input) => {
            crate::transfer::apply("transferInitialize", &input, state)
        }
        Request::TransferArchive(input) => crate::transfer::apply("transferArchive", &input, state),
        Request::TransferPending(input) => crate::transfer::apply("transferPending", &input, state),
        Request::TransferRelease(input) => crate::transfer::apply("transferRelease", &input, state),
        Request::TransferTransactionInitialize(input) => {
            crate::transfer::apply("transferTransactionInitialize", &input, state)
        }
        Request::TransferTransactionReceipt(input) => {
            crate::transfer::apply("transferTransactionReceipt", &input, state)
        }
        _ => Err(invalid("invalid transfer operation")),
    }
}

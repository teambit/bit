pub(super) mod input;
pub(super) mod policy;

mod apply_command;
mod bitmap;
mod capture;
mod finalize_command;
mod history;
mod lane_context;
mod lane_finalize;
mod lane_publication;
mod lane_referenced;
mod lane_selection;
mod materialization;
mod merge;
mod merge_dependency_guard;
mod merge_planning;
mod plan_command;
mod planning;
mod prepare;
mod repository;
mod scratch;
mod selection;
mod setup;

use super::{dependency_graph::proof, invalid};
use input::Prepare;
use serde::Deserialize;
use serde_json::Value;
use std::io;

#[derive(Default)]
pub(crate) struct State {
    sequence: u64,
    record: Option<Record>,
}
struct Record {
    request: Prepare,
    context: Value,
    targets: Vec<Value>,
    repository: repository::Repository,
    proofs: Vec<proof::Proof>,
    token: String,
    planned: Option<PreparedPlan>,
    history: history::State,
}
struct PreparedPlan {
    plan: planning::Planned,
    bitmap: bitmap::Prepared,
    snap_bitmap: Option<bitmap::Prepared>,
}
pub(super) fn prepare(
    request: Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    setup::run(request, state, pool)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    token: String,
    current: Vec<Value>,
    #[serde(default)]
    lane_pattern_ids: Option<Vec<String>>,
    semver: Value,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Apply {
    token: String,
    file_id: String,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
pub(super) fn plan(
    input: Plan,
    snapshots: &mut crate::workspace::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    plan_command::run(input, snapshots, pool)
}

pub(super) fn apply(input: &Apply, state: &mut State) -> io::Result<(usize, Value)> {
    apply_command::run(input, state)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Finalize {
    token: String,
    snap_receipt: Value,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
pub(super) fn finalize(input: &Finalize, state: &mut State) -> io::Result<(usize, Value)> {
    finalize_command::run(input, state)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LaneFinalize {
    token: String,
    lane_receipt: Value,
}
pub(super) fn finalize_lane(input: &LaneFinalize, state: &mut State) -> io::Result<(usize, Value)> {
    lane_finalize::run(input, state)
}

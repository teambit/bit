mod cascade;
mod context;
mod graph;
mod hidden;
mod issue_graph;
mod issue_heads;
mod planning;
mod projection;
mod publication;
mod selection;
mod snap;
mod source_proofs;

use super::{Record, State, invalid, proof};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    options: Options,
    #[serde(skip)]
    ordinary_snap: bool,
    #[serde(default)]
    dependency_grammar: Value,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    pattern: Option<String>,
    message: Option<String>,
    #[serde(default)]
    build: bool,
    #[serde(default)]
    unmodified: bool,
    #[serde(default)]
    unmerged: bool,
    #[serde(default)]
    skip_auto_snap: bool,
}

pub(super) struct Retained {
    record: Record,
    pending: Vec<Value>,
    selected: Vec<String>,
    message: String,
    materials: Vec<super::resolve_snapshot::Material>,
    result: Value,
    finalized: publication::Phase,
    snap: Option<Options>,
}

pub(in crate::workspace::engine) fn prepare(
    input: &Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    if state.record.is_some() || state.recovery.is_some() || state.resolve.is_some() {
        return Err(invalid("command owner already active"));
    }
    let retained = context::prepare(input, state, pool)?;
    let output = json!({"token":retained.record.token,"context":retained.record.context,
        "targets":retained.record.targets,"selectedIds":retained.selected});
    let count = retained.record.targets.len();
    state.resolve = Some(retained);
    Ok((count, output))
}

pub(in crate::workspace::engine) fn prepare_snap(
    mut input: Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    input.ordinary_snap = true;
    prepare(&input, state, pool)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Plan {
    token: String,
    current: Vec<Value>,
    components: Vec<projection::Component>,
    semver: Value,
    selected_ids: Option<Vec<String>>,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
pub(in crate::workspace::engine) fn plan(
    input: Plan,
    snapshots: &mut crate::workspace::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.resolve.take().ok_or_else(|| invalid("resolve owner absent"))?;
    if retained.record.token != input.token
        || !retained.materials.is_empty()
        || !matches!(retained.finalized, publication::Phase::Pending)
    {
        return Err(invalid("resolve planning state"));
    }
    let result = planning::prepare(&mut retained, input, snapshots, pool);
    let count = retained.materials.len();
    snapshots.command.resolve = Some(retained);
    result.map(|value| (count, value))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Finalize {
    token: String,
    snap_receipt: Value,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
    file_id: String,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
pub(in crate::workspace::engine) fn finalize(
    input: Finalize,
    snapshots: &mut crate::workspace::snapshots::State,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.resolve.take().ok_or_else(|| invalid("resolve owner absent"))?;
    let result = publication::finalize(input, &mut retained, snapshots);
    let count = retained.materials.len();
    snapshots.command.resolve = Some(retained);
    result.map(|value| (count, value))
}
pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let mut retained = state.resolve.take().ok_or_else(|| invalid("resolve owner absent"))?;
    let result = publication::apply(input, &mut retained)?;
    Ok((retained.materials.len(), result))
}

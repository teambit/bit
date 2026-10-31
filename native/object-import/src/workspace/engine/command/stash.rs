//! Detached stash objects never publish component heads or workspace state.
mod graph;
mod history;
mod planning;
mod projection;
mod publication;
mod version;

use super::{invalid, repository::Repository, scratch};
use crate::workspace::{
    engine::{dependency_graph::proof, status_context},
    snapshots,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Plan {
    token: String,
    current: Vec<Value>,
    components: Vec<super::resolve::projection::Component>,
    selected_ids: Option<Vec<String>>,
    #[serde(default)]
    consumer_metadata: std::collections::HashMap<String, Value>,
    #[serde(default)]
    include_new: bool,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Finalize {
    token: String,
    versions: Vec<Allocation>,
    bit_version: String,
    message: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct StageHistory {
    token: String,
    #[serde(default)]
    prepare_only: bool,
    selected_ids: Option<Vec<String>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Allocation {
    identity: String,
    hash: String,
    log: Option<Value>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::workspace::engine) struct Persist {
    token: String,
}
struct Component {
    identity: String,
    id: Value,
    version: Value,
    files: Vec<Value>,
    previous: Option<String>,
    bitmap_entry: Value,
    new: bool,
}
pub(super) struct Retained {
    root: PathBuf,
    token: String,
    context: Value,
    repository: Repository,
    proofs: Vec<proof::Proof>,
    components: Vec<Component>,
    prepared: Option<publication::Prepared>,
    graph: GraphPhase,
}

#[derive(Default)]
struct GraphPhase {
    history_plans: Option<Vec<Value>>,
    history: bool,
    staged: bool,
    error: Option<String>,
}

pub(in crate::workspace::engine) fn prepare(
    request: Prepare,
    state: &mut super::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let (_, context) = status_context::read(
        &status_context::Request { root: request.root.clone(), home: request.home, history: false },
        pool,
    )?;
    let proofs: Vec<proof::Proof> =
        serde_json::from_value(context["controlReadSet"].clone()).map_err(io::Error::other)?;
    state.sequence = state.sequence.checked_add(1).ok_or_else(|| invalid("stash sequence"))?;
    let token = crate::workspace::engine::hash(
        format!("stash:{}:{}", std::process::id(), state.sequence).as_bytes(),
    );
    let imported =
        crate::command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
    let result = json!({"token":token,"context":context});
    state.stash = Some(Box::new(Retained {
        root: request.root.clone(),
        token,
        context,
        repository: Repository::new(&request.root, Some(imported)),
        proofs,
        components: Vec::new(),
        prepared: None,
        graph: GraphPhase::default(),
    }));
    Ok((0, result))
}

pub(in crate::workspace::engine) fn plan(
    input: Plan,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.stash.take().ok_or_else(|| invalid("stash session absent"))?;
    let result = planning::plan(&mut retained, input, snapshots, pool);
    snapshots.command.stash = Some(retained);
    result.map(|result| (0, result))
}

pub(in crate::workspace::engine) fn finalize(
    input: Finalize,
    snapshots: &mut snapshots::State,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.stash.take().ok_or_else(|| invalid("stash session absent"))?;
    let result = publication::prepare(&mut retained, input, snapshots);
    snapshots.command.stash = Some(retained);
    result.map(|result| (0, result))
}

pub(in crate::workspace::engine) fn stage_history(
    input: &StageHistory,
    state: &mut super::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let retained = state.stash.as_mut().ok_or_else(|| invalid("stash session absent"))?;
    retained.check(&input.token)?;
    if retained.graph.history || retained.graph.staged || retained.prepared.is_some() {
        return Err(invalid("stash history already staged"));
    }
    let written = if input.prepare_only {
        history::prepare(retained, input.selected_ids.as_deref(), pool)?
    } else {
        let written = history::commit(retained, input.selected_ids.as_deref(), pool)?;
        retained.graph.history = true;
        written
    };
    Ok((written, json!({"token":retained.token,"written":written})))
}

pub(in crate::workspace::engine) fn stage_graph(
    input: &Persist,
    state: &mut super::State,
) -> io::Result<(usize, Value)> {
    let retained = state.stash.as_mut().ok_or_else(|| invalid("stash session absent"))?;
    retained.check(&input.token)?;
    if retained.graph.staged {
        return Err(invalid("stash graph already staged"));
    }
    let files = retained.repository.commit_import_retained()?;
    proof::accept_published(&mut retained.proofs, &files);
    retained.repository.accept_published(&files)?;
    retained.graph.staged = true;
    if let Some(message) = &retained.graph.error {
        return Err(crate::workspace::engine::response::canonical(message.clone()));
    }
    Ok((0, json!({"token":retained.token,"progress":retained.repository.progress()})))
}

pub(in crate::workspace::engine) fn persist(
    input: &Persist,
    state: &mut super::State,
) -> io::Result<(usize, Value)> {
    let retained = state.stash.as_mut().ok_or_else(|| invalid("stash session absent"))?;
    retained.check(&input.token)?;
    let prepared = retained.prepared.as_mut().ok_or_else(|| invalid("stash not finalized"))?;
    prepared.commit(&retained.root)?;
    Ok((retained.components.len(), prepared.result.clone()))
}

impl Retained {
    fn check(&self, token: &str) -> io::Result<()> {
        let token = token.trim();
        if token.is_empty() || token != self.token {
            return Err(invalid("stale stash token"));
        }
        proof::verify(&self.proofs)?;
        self.repository.validate()
    }
}

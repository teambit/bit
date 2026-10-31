pub(super) mod projection;
pub(super) mod source_proofs;
pub(in crate::workspace::engine) use publication::{
    builder::{BuildFinalize, StageBuild},
    packages::{PackageFinalize, StagePackages},
};
pub(in crate::workspace::engine) use refresh::{Refresh, Validate};
pub(in crate::workspace::engine) use tag::{Overrides as TagOverrides, override_versions};

mod cascade;
mod context;
mod graph;
mod hidden;
mod issue_graph;
mod issue_heads;
mod logs;
mod planning;
mod publication;
mod refresh;
mod root;
mod selection;
mod snap;
mod tag;
mod tag_versions;

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
    #[serde(skip)]
    ordinary_tag: bool,
    tag_options: Option<tag::Options>,
    #[serde(default)]
    dependency_grammar: Value,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    #[serde(default)]
    callback_lifecycle: bool,
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
    #[serde(default)]
    policy: Policy,
}

#[derive(Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Policy {
    #[serde(rename = "ignoreIssues")]
    _ignore_issues: Option<String>,
    #[serde(default)]
    pub ignore_newest_version: bool,
    #[serde(default)]
    pub rebuild_deps_graph: bool,
    #[serde(default)]
    pub no_lock_deps: bool,
    #[serde(default)]
    pub skip_published_versions: bool,
}

struct Selection {
    identities: Vec<String>,
    load_count: usize,
}
impl Selection {
    fn unique(identities: Vec<String>) -> Self {
        let mut unique = Vec::with_capacity(identities.len());
        for id in identities {
            let trimmed = id.trim();
            if !trimmed.is_empty()
                && !unique
                    .iter()
                    .any(|existing| existing == trimmed)
            {
                unique.push(trimmed.to_owned());
            }
        }
        Self { load_count: unique.len(), identities: unique }
    }
}

pub(super) struct Retained {
    record: Record,
    pending: Vec<Value>,
    selected: Vec<String>,
    materials: Vec<super::resolve_snapshot::Material>,
    result: Value,
    finalized: publication::Phase,
    snap: Option<Options>,
    tag: Option<tag::Options>,
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

pub(in crate::workspace::engine) fn prepare_tag(
    mut input: Prepare,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let tag = input.tag_options.as_ref().ok_or_else(|| invalid("tag options absent"))?;
    input.options.skip_auto_snap = tag.skip_auto_tag;
    input.ordinary_snap = true;
    input.ordinary_tag = true;
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
    tag_selections: Option<Vec<Value>>,
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
        || !matches!(retained.finalized, publication::Phase::Pending(_))
    {
        return Err(invalid("resolve planning state"));
    }
    let result = planning::prepare(&mut retained, input, snapshots, pool);
    let count = retained.materials.len();
    snapshots.command.resolve = Some(retained);
    result.map(|value| (count, value))
}

pub(in crate::workspace::engine) fn tag_candidates(
    input: Plan,
    snapshots: &mut crate::workspace::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.resolve.take().ok_or_else(|| invalid("resolve owner absent"))?;
    let result = (|| {
        if retained.record.token != input.token
            || retained.tag.is_none()
            || !retained.materials.is_empty()
        {
            return Err(invalid("tag candidates state"));
        }
        let captured =
            super::capture::all(&retained.record.request.root, input.current, snapshots, pool)?;
        let ids = tag::candidate_ids(&mut retained, &captured)?;
        Ok((ids.len(), json!({"token":retained.record.token,"candidateIds":ids})))
    })();
    snapshots.command.resolve = Some(retained);
    result
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

pub(in crate::workspace::engine) fn validate_snapshot(
    input: &Validate,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    refresh::validate(input, state)
}
pub(in crate::workspace::engine) fn refresh_snapshot(
    input: Refresh,
    snapshots: &mut crate::workspace::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    refresh::apply(input, snapshots, pool)
}

pub(in crate::workspace::engine) fn stage_build(
    input: &StageBuild,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    publication::builder::stage(input, state)
}
pub(in crate::workspace::engine) fn build_finalize(
    input: BuildFinalize,
    snapshots: &mut crate::workspace::snapshots::State,
) -> io::Result<(usize, Value)> {
    publication::builder::finalize(input, snapshots)
}

pub(in crate::workspace::engine) fn package_finalize(
    input: PackageFinalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    publication::packages::finalize(input, state)
}

pub(in crate::workspace::engine) fn stage_packages(
    input: &StagePackages,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    publication::packages::stage(input, state)
}

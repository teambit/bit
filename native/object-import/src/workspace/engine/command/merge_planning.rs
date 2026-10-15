mod fast_forward;
mod lane_filter;
mod lifecycle;
mod loading;
mod pending;
mod policy_rows;
mod preflight;
mod removal;
use super::{
    super::{dependency_graph::proof, invalid},
    Record, capture, history,
    input::{Operation, Prepare},
    merge, planning,
    repository::{Repository, model},
    scratch, selection,
};
use crate::{checkout_transition, workspace::snapshots};
use removal::Removed;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) struct Prepared {
    pub(super) policy: Option<super::policy::Prepared>,
    publication: Publication,
    state: merge::State,
    pub(super) materials: Vec<merge::Prepared>,
    unmerged: Value,
    proofs: Vec<proof::Proof>,
    pending: Vec<Pending>,
    finalized: Option<Finalized>,
}
struct Publication {
    lane: Option<super::lane_publication::Prepared>,
    fast_forward: Option<merge::snapshot::Snapshot>,
    removed: Vec<Removed>,
}
struct Pending {
    identity: String,
    directory: String,
    model: Value,
    remote: String,
}
struct Finalized {
    snapshot: merge::snapshot::Snapshot,
    files: merge::finalization::Prepared,
}

pub(super) fn select_targets(
    request: &Prepare,
    context: &Value,
    targets: Vec<Value>,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<Vec<Value>> {
    if request.operation != Operation::Merge
        || request.options.pattern.is_some()
        || request.options.lane.is_some()
    {
        return Ok(targets);
    }
    let mut selected = Vec::new();
    for target in targets {
        let identity =
            target["identity"].as_str().ok_or_else(|| invalid("command merge identity"))?;
        let Some(model) = model(context, identity)? else {
            continue;
        };
        let remote = repository.remote_head(identity)?;
        let distance = history.distance(
            &request.root,
            identity,
            &model,
            [model["head"].as_str(), remote.as_deref()],
            repository,
        )?;
        if !distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
            && !distance["targetOnly"].as_array().is_some_and(Vec::is_empty)
        {
            selected.push(target);
        }
    }
    Ok(selected)
}

pub(super) fn plan(
    record: &mut Record,
    current: Vec<Value>,
    lane_pattern: Option<&[String]>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<planning::Planned> {
    planning::validate_current(record, &current)?;
    let mut captured = capture::all(&record.request.root, current, snapshots, pool)?;
    capture::lane_visibility(&mut captured, &record.context)?;
    let mut planned = planning::Planned {
        captured,
        transitions: checkout_transition::State::default(),
        history: std::mem::take(&mut record.history),
        materials: Vec::new(),
        directories: Vec::new(),
        result: json!({"components":[],"failedComponents":[],"removedComponents":[]}),
        merge: None,
    };
    lane_filter::capture_hidden(record, &mut planned, snapshots)?;
    lane_filter::capture_additions(record, &mut planned)?;
    lane_filter::validate_captures(record, &planned)?;
    let mut state = merge::State::new(planned.captured.len())?;
    let mut selected = Vec::new();
    for index in 0..planned.captured.len() {
        selected.push(select(record, &mut planned, &mut state, index)?);
    }
    loading::import_gap(record, &mut selected)?;
    lane_filter::apply(record, &mut planned, &mut selected, lane_pattern)?;
    if selected
        .iter()
        .any(|row| row.distance["shouldBeRemoved"] == true && row.action != Action::Merge)
    {
        return Err(invalid("command removed fast-forward requires canonical transition"));
    }
    prepare_materials(record, &mut planned, state, &selected, snapshots)?;
    Ok(planned)
}

struct Selected {
    model: Value,
    remote: String,
    current_hash: String,
    current_head: String,
    versions: [Value; 3],
    base: String,
    action: Action,
    distance: Value,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    Unchanged,
    Merge,
    Target,
}

fn select(
    record: &mut Record,
    planned: &mut planning::Planned,
    state: &mut merge::State,
    index: usize,
) -> io::Result<Selected> {
    let captured = &planned.captured[index];
    let mut selected = loading::load_selected(record, captured)?;
    let distance = planned.history.distance(
        &record.request.root,
        &captured.target.identity,
        &selected.model,
        [
            (!selected.current_head.is_empty()).then_some(selected.current_head.as_str()),
            Some(&selected.remote),
        ],
        &mut record.repository,
    )?;
    selected.distance = distance.clone();
    let mut target = record.targets.iter().find(|target| target["identity"] == captured.target.identity).cloned().unwrap_or_else(|| json!({"identity":captured.target.identity,"version":captured.target.version,"hidden":captured.hidden}));
    target["version"] = json!(selected.remote);
    target["bitmapPresent"] = json!(!captured.added && !captured.target.directory.is_empty());
    let outcome = state.select(&merge::Input {
        index,
        target: &target,
        model: Some(&selected.model),
        incoming: &selected.versions[2],
        current: &selected.versions[1],
        options: loading::options(record, captured, &selected)?,
        distance: &distance,
        lane: record.context.get("lane"),
    })?;
    apply_selection(
        &mut selected,
        &outcome,
        &distance,
        &captured.target.identity,
        &mut planned.result,
    )?;
    selected.distance["importGap"] = json!(selected.action != Action::Unchanged);
    Ok(selected)
}
fn apply_selection(
    selected: &mut Selected,
    outcome: &Value,
    distance: &Value,
    identity: &str,
    result: &mut Value,
) -> io::Result<()> {
    if outcome["action"] == "unchanged" && outcome["legitimate"] == true {
        result["failedComponents"].as_array_mut().unwrap().push(json!({"id":format!("{identity}@{}",selected.remote),"unchangedMessage":outcome["message"],"unchangedLegitimately":true}));
        return Ok(());
    }
    selected.distance["shouldBeRemoved"] = outcome["shouldBeRemoved"].clone();
    selected.action = match outcome["action"].as_str() {
        Some("merge") => Action::Merge,
        Some("target") => Action::Target,
        _ => return Err(invalid("command merge requires canonical transition")),
    };
    if let Some(common) = distance["common"].as_str() {
        selected.base = common.into();
    } else if selected.action == Action::Merge {
        return Err(invalid("command merge common version"));
    }
    Ok(())
}

fn body<'a>(
    record: &'a Record,
    selected: &'a Selected,
    current: &'a capture::Captured,
    directory: &'a Path,
    index: usize,
) -> merge::BodyInput<'a> {
    merge::BodyInput {
        root: &record.request.root,
        directory,
        index,
        current,
        options: &record.request.options,
        overlay: record.repository.overlay(),
        lane: record.context.get("lane"),
        sides: [
            merge::VersionSide { hash: &selected.base, value: &selected.versions[0] },
            merge::VersionSide { hash: &selected.current_hash, value: &selected.versions[1] },
            merge::VersionSide { hash: &selected.remote, value: &selected.versions[2] },
        ],
    }
}
fn prepare_materials(
    record: &mut Record,
    planned: &mut planning::Planned,
    mut state: merge::State,
    selected: &[Selected],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let directory = scratch::Directory::create()?;
    // Each body snapshots into its own empty directory.
    let requests = selected
        .iter()
        .enumerate()
        .filter(|(_, selected)| selected.action == Action::Merge)
        .map(|(index, selected)| {
            let own = directory.child(index)?;
            body(record, selected, &planned.captured[index], &own, index).request()
        })
        .collect::<io::Result<Vec<_>>>()?;
    let plans = state.prepare_bodies(requests, snapshots, record.repository.overlay())?;
    let mut prepared = empty_plan(record, state)?;
    for ((index, selected), plan) in selected
        .iter()
        .enumerate()
        .filter(|(_, selected)| selected.action == Action::Merge)
        .zip(plans)
    {
        let own = directory.0.join(index.to_string());
        add_material(record, planned, &mut prepared, selected, index, &own, &plan)?;
    }
    prepare_lane_targets(record, &mut prepared, selected)?;
    fast_forward::prepare(record, planned, &mut prepared, selected, snapshots)?;
    if !record.request.options.no_snap
        && !record.request.options.lane.as_ref().is_some_and(|lane| lane.no_auto_snap)
    {
        removal::prepare(planned, &mut prepared, selected)?;
    }
    policy_rows::fast_forward(&mut prepared, planned, &record.context)?;
    if prepared.policy.as_ref().is_some_and(|policy| policy.rows.is_empty()) {
        prepared.policy = None;
    }
    if prepared.materials.is_empty() || prepared.policy.is_none() {
        prepared.policy = None;
        preflight::validate(record, &mut prepared, &planned.materials, &planned.captured)?;
    }
    planned.directories.push(directory);
    planned.merge = Some(prepared);
    Ok(())
}
fn empty_plan(record: &mut Record, state: merge::State) -> io::Result<Prepared> {
    Ok(Prepared {
        publication: Publication {
            lane: super::lane_publication::Prepared::prepare(record)?,
            fast_forward: None,
            removed: Vec::new(),
        },
        policy: Some(super::policy::Prepared::new()),
        state,
        materials: Vec::new(),
        unmerged: json!([]),
        proofs: Vec::new(),
        pending: Vec::new(),
        finalized: None,
    })
}

fn prepare_lane_targets(
    record: &mut Record,
    prepared: &mut Prepared,
    selected: &[Selected],
) -> io::Result<()> {
    if let Some(lane) = &mut prepared.publication.lane {
        for selected in selected
            .iter()
            .filter(|selected| selected.action == Action::Target)
        {
            lane.plan_squash(
                &selected.remote,
                &selected.versions[2],
                &selected.model,
                &selected.distance,
                record.request.options.message.as_deref(),
                &mut record.repository,
            )?;
        }
    }
    if record.request.options.lane.is_some() {
        record.repository.prepare_lane_artifacts(
            &selected
                .iter()
                .map(|row| row.remote.clone())
                .collect::<Vec<_>>(),
        )?;
    }
    Ok(())
}

fn add_material(
    record: &Record,
    planned: &mut planning::Planned,
    prepared: &mut Prepared,
    selected: &Selected,
    index: usize,
    directory: &Path,
    plan: &Value,
) -> io::Result<()> {
    let current = &planned.captured[index];

    let mut material =
        prepared.state.prepare_result(&body(record, selected, current, directory, index), plan)?;
    if selected.distance["shouldBeRemoved"] == true
        && (material.has_conflicts() || material.no_write())
    {
        return Err(invalid("command unresolved removed merge"));
    }
    if current.hidden {
        lane_filter::prepare_hidden_metadata(current, &selected.versions, &mut material.version)?;
    } else {
        policy_rows::divergent(prepared, selected, current, &material)?;
    }
    retain_snapshot(record, prepared, selected, current, &material)?;
    planned.result["components"]
        .as_array_mut()
        .unwrap()
        .push(material.output.clone());
    if material.has_conflicts() {
        planned.result["leftUnresolvedConflicts"] = json!(true);
    }
    prepared.unmerged
        .as_array_mut()
        .unwrap()
        .push(pending::entry(
            &selected.model,
            &selected.remote,
            record.context.get("lane"),
            &material,
        ));
    prepared.materials.push(material);
    Ok(())
}
fn retain_snapshot(
    record: &Record,
    prepared: &mut Prepared,
    selected: &Selected,
    current: &capture::Captured,
    material: &merge::Prepared,
) -> io::Result<()> {
    if record.request.options.no_snap
        || record.request.options.lane.as_ref().is_some_and(|lane| lane.no_auto_snap)
        || material.has_conflicts()
    {
        return Ok(());
    }
    prepared.pending.push(Pending {
        identity: current.target.identity.clone(),
        directory: current.target.directory.clone(),
        model: selected.model.clone(),
        remote: selected.remote.clone(),
    });
    Ok(())
}

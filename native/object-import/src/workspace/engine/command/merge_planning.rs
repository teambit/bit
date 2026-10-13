mod fast_forward;
mod lifecycle;
mod preflight;
use super::{
    super::{dependency_graph::proof, invalid, status_models::comparison},
    Record, capture, history,
    input::{Operation, Prepare},
    merge, planning,
    repository::{Repository, model},
    scratch, selection,
};
use crate::{checkout_transition, workspace::snapshots};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) struct Prepared {
    state: merge::State,
    materials: Vec<merge::Prepared>,
    unmerged: Value,
    proofs: Vec<proof::Proof>,
    pending: Vec<Pending>,
    finalized: Option<Finalized>,
    fast_forward: Option<merge::snapshot::Snapshot>,
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
    if request.operation != Operation::Merge || request.options.pattern.is_some() {
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
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<planning::Planned> {
    planning::validate_current(record, &current)?;
    let captured = capture::all(&record.request.root, current, snapshots, pool)?;
    let mut planned = planning::Planned {
        captured,
        transitions: checkout_transition::State::default(),
        history: std::mem::take(&mut record.history),
        materials: Vec::new(),
        directories: Vec::new(),
        result: json!({"components":[],"failedComponents":[],"removedComponents":[]}),
        merge: None,
    };
    let mut state = merge::State::new(planned.captured.len())?;
    let mut selected = Vec::new();
    for index in 0..planned.captured.len() {
        selected.push(select(record, &mut planned, &mut state, index)?);
    }
    prepare_materials(record, &mut planned, state, &mut selected, snapshots)?;
    Ok(planned)
}

struct Selected {
    model: Value,
    remote: String,
    current_hash: String,
    versions: [Value; 3],
    base: String,
    action: Action,
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
    let mut selected = load_selected(record, captured)?;
    let distance = planned.history.distance(
        &record.request.root,
        &captured.target.identity,
        &selected.model,
        [selected.model["head"].as_str(), Some(&selected.remote)],
        &mut record.repository,
    )?;
    let modified = comparison::compare(
        &captured.target,
        &captured.metadata,
        &selected.versions[1],
    )?["modified"]
        == true;
    let mut target = record.targets[index].clone();
    target["version"] = json!(selected.remote);
    let outcome = state.select(&merge::Input {
        index,
        target: &target,
        model: Some(&selected.model),
        incoming: &selected.versions[2],
        current: &selected.versions[1],
        modified,
        distance: &distance,
    })?;
    apply_selection(
        &mut selected,
        &outcome,
        &distance,
        &captured.target.identity,
        &mut planned.result,
    )?;
    Ok(selected)
}
fn load_selected(record: &mut Record, captured: &capture::Captured) -> io::Result<Selected> {
    let identity = &captured.target.identity;
    let model =
        model(&record.context, identity)?.ok_or_else(|| invalid("command merge missing model"))?;
    if record.repository.read(&super::super::hash(identity.as_bytes()), "Component")? != model {
        return Err(invalid("command merge model changed"));
    }
    let remote = record.repository
        .remote_head(identity)?
        .ok_or_else(|| invalid("command merge missing remote head"))?;
    let current_hash = selection::versions::reference(&model, &captured.target.version)?;
    let current = record.repository.read(&current_hash, "Version")?;
    let incoming = record.repository.read(&remote, "Version")?;
    Ok(Selected {
        model,
        remote,
        current_hash,
        versions: [Value::Null, current, incoming],
        base: String::new(),
        action: Action::Unchanged,
    })
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
    if outcome["shouldBeRemoved"] == true {
        return Err(invalid("command merge requires canonical transition"));
    }
    selected.action = match outcome["action"].as_str() {
        Some("merge") => Action::Merge,
        Some("target") => Action::Target,
        _ => return Err(invalid("command merge requires canonical transition")),
    };
    distance["common"]
        .as_str()
        .ok_or_else(|| invalid("command merge common version"))?
        .clone_into(&mut selected.base);
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
    selected: &mut [Selected],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    import_gap(record, selected)?;
    let directory = scratch::Directory::create()?;
    let requests = selected
        .iter()
        .enumerate()
        .filter(|(_, selected)| selected.action == Action::Merge)
        .map(|(index, selected)| {
            body(record, selected, &planned.captured[index], &directory.0, index).request()
        })
        .collect::<io::Result<Vec<_>>>()?;
    let plans = state.prepare_bodies(requests)?;
    let mut prepared = Prepared {
        state,
        materials: Vec::new(),
        unmerged: json!([]),
        proofs: Vec::new(),
        pending: Vec::new(),
        finalized: None,
        fast_forward: None,
    };
    for ((index, selected), plan) in selected
        .iter()
        .enumerate()
        .filter(|(_, selected)| selected.action == Action::Merge)
        .zip(plans)
    {
        add_material(record, planned, &mut prepared, selected, index, &directory.0, &plan)?;
    }
    fast_forward::prepare(record, planned, &mut prepared, selected, snapshots)?;
    preflight::validate(record, &mut prepared, &planned.materials, &planned.captured)?;
    planned.directories.push(directory);
    planned.merge = Some(prepared);
    Ok(())
}
fn import_gap(record: &mut Record, selected: &mut [Selected]) -> io::Result<()> {
    let gap = selected
        .iter()
        .filter(|selected| selected.action != Action::Unchanged)
        .map(|selected| {
            Ok(crate::command_import::Target {
                scope: selected.model["scope"].as_str().map(str::to_owned),
                name: selected.model["name"]
                    .as_str()
                    .ok_or_else(|| invalid("command merge name"))?
                    .to_owned(),
                version: selected.base.clone(),
            })
        })
        .collect::<io::Result<Vec<_>>>()?;
    record.repository.prepare_merge_gap(&gap)?;
    for selected in selected
        .iter_mut()
        .filter(|selected| selected.action != Action::Unchanged)
    {
        let identity = format!(
            "{}/{}",
            selected.model["scope"].as_str().unwrap_or_default(),
            selected.model["name"].as_str().unwrap_or_default(),
        );
        let model = record.repository.read(&super::super::hash(identity.as_bytes()), "Component")?;
        refresh_model(selected, model)?;
        selected.versions[0] = record.repository.read(&selected.base, "Version")?;
    }
    Ok(())
}
fn refresh_model(selected: &mut Selected, model: Value) -> io::Result<()> {
    if selected.action == Action::Merge && model["head"] != selected.model["head"] {
        return Err(invalid("command merge local head changed during gap import"));
    }
    // Import can advance a fast-forward model, but never changes the cached target
    // selected before fetching the common snap.
    selected.model = model;
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
    if plan["hasConflicts"] == true && record.request.options.strategy.as_deref() == Some("ours") {
        return Err(invalid("command ours conflict lifecycle"));
    }
    let material =
        prepared.state.prepare_result(&body(record, selected, current, directory, index), plan)?;
    retain_snapshot(record, prepared, selected, current, &material)?;
    planned.result["components"]
        .as_array_mut()
        .unwrap()
        .push(material.output.clone());
    if material.has_conflicts {
        planned.result["leftUnresolvedConflicts"] = json!(true);
    }
    let mut unmerged = json!({"id":{"name":selected.model["name"],"scope":selected.model["scope"]},"head":selected.remote,
        "laneId":{"scope":selected.model["scope"],"name":"main"},"shouldSquash":false,"mergedConfig":{}});
    if material.has_conflicts {
        unmerged["unmergedPaths"] = json!(material.conflict_paths);
    }
    prepared.unmerged
        .as_array_mut()
        .unwrap()
        .push(unmerged);
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
    if record.request.options.no_snap || material.has_conflicts {
        return Ok(());
    }
    prepared.proofs.extend(super::merge_dependency_guard::verify(
        &record.request.root,
        &record.request.home,
        current,
        &material.files,
        &record.request.dependency_grammar,
    )?);
    prepared.pending.push(Pending {
        identity: current.target.identity.clone(),
        directory: current.target.directory.clone(),
        model: selected.model.clone(),
        remote: selected.remote.clone(),
    });
    Ok(())
}

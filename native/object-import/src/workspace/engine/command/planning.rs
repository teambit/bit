mod history_replay;
use super::{
    super::{invalid, status_models::comparison},
    Record, capture, history, materialization, repository, scratch, selection,
};
use crate::{checkout_transition, command_import, workspace::snapshots};
use serde_json::{Value, json};
use std::io;

pub(super) struct Planned {
    pub(super) captured: Vec<capture::Captured>,
    pub(super) transitions: checkout_transition::State,
    pub(super) history: history::State,
    pub(super) materials: Vec<materialization::Prepared>,
    pub(super) directories: Vec<scratch::Directory>,
    pub(super) result: Value,
    pub(super) merge: Option<super::merge_planning::Prepared>,
}
pub(super) fn checkout(
    record: &mut Record,
    current: Vec<Value>,
    semver: &Value,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Planned> {
    validate_current(record, &current)?;
    let captured = capture::all(&record.request.root, current, snapshots, pool)?;
    let mut plan = Planned {
        captured,
        transitions: checkout_transition::State::default(),
        history: history::State::default(),
        merge: None,
        materials: Vec::new(),
        directories: Vec::new(),
        result: json!({"components":[],"failedComponents":[],"removedComponents":[]}),
    };
    let mut selections = Vec::new();
    for (index, captured) in plan.captured.iter().enumerate() {
        selections.push(select(
            record,
            index,
            captured,
            semver,
            &mut plan.history,
            &mut plan.transitions,
        )?);
    }
    import_selected(record, &selections)?;
    prepare_selections(record, &mut plan, &selections, snapshots)?;
    if let Some(to) = record.request.options.to.as_deref()
        && !matches!(to, "head" | "latest" | "reset" | "main")
        && !to.starts_with("head~")
    {
        plan.result["version"] = json!(to);
    }
    Ok(plan)
}
pub(super) fn validate_current(record: &Record, current: &[Value]) -> io::Result<()> {
    if current.len() != record.targets.len() {
        return Err(invalid("command capture selection"));
    }
    for (current, target) in current.iter().zip(&record.targets) {
        for key in ["identity", "directory", "version"] {
            if current[key] != target[key] {
                return Err(invalid("command capture target changed"));
            }
        }
        if !target["config"].is_null() {
            return Err(invalid("command component configuration write"));
        }
    }
    let policy = &record.context["workspace"]["teambit.dependencies/dependency-resolver"]["policy"];
    if policy
        .as_object()
        .is_some_and(|fields| {
            fields
                .values()
                .any(|value| !value.as_object().is_some_and(serde_json::Map::is_empty))
        })
    {
        return Err(invalid("command workspace policy update requires planner"));
    }
    Ok(())
}
fn select(
    record: &mut Record,
    index: usize,
    captured: &capture::Captured,
    semver: &Value,
    histories: &mut history::State,
    state: &mut checkout_transition::State,
) -> io::Result<Value> {
    let identity = &captured.target.identity;
    let model = repository::model(&record.context, identity)?;
    let remote = record.repository.remote_head(identity)?;
    let (modified, pending) =
        modification(record, captured, model.as_ref(), remote.as_deref(), histories)?;
    let selected = selection::select(
        &record.request.options,
        &selection::Selection {
            target: &record.targets[index],
            model: model.as_ref(),
            modified,
            merge_pending: pending,
            remote_head: remote.as_deref(),
            semver,
        },
        &mut record.repository,
        state,
    )?;
    history_replay::replay(
        record,
        identity,
        model.as_ref(),
        remote.as_deref(),
        &selected,
        histories,
    )?;
    Ok(selected)
}
fn import_selected(record: &mut Record, selections: &[Value]) -> io::Result<()> {
    let targets = record.targets
        .iter()
        .zip(selections)
        .map(|(target, selection)| import_target(target, selection))
        .collect::<io::Result<Vec<_>>>()?;
    let mut expanded = Vec::new();
    for ((target, selection), original) in targets
        .into_iter()
        .zip(selections)
        .zip(&record.targets)
    {
        expanded.push(target.clone());
        if selection["merge"] == true {
            expanded.push(command_import::Target {
                version: original["version"]
                    .as_str()
                    .ok_or_else(|| invalid("command merge base version"))?
                    .to_owned(),
                ..target
            });
        }
    }
    record.repository.prepare_versions(&expanded)
}
fn failure(result: &mut Value, target: &Value, selected: &Value) -> io::Result<()> {
    if selected["legitimate"] != true || selected["shouldBeRemoved"] == true {
        return Err(invalid("command checkout failure requires canonical error"));
    }
    let identity =
        target["identity"].as_str().ok_or_else(|| invalid("command failure identity"))?;
    let version = target["version"].as_str().unwrap_or_default();
    result["failedComponents"]
        .as_array_mut()
        .ok_or_else(|| invalid("command failures"))?
        .push(json!({
            "id":if version.is_empty(){identity.to_owned()}else{format!("{identity}@{version}")},
            "unchangedMessage":selected["message"],"unchangedLegitimately":true,
        }));
    Ok(())
}
fn prepare_one(
    record: &mut Record,
    plan: &mut Planned,
    index: usize,
    selected: &Value,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let current = &plan.captured[index];
    let model = record.repository.read(
        &super::super::hash(current.target.identity.as_bytes()),
        "Component",
    )?;
    let reference = selection::versions::reference(
        &model,
        selected["version"].as_str().ok_or_else(|| invalid("command selected Version"))?,
    )?;
    let version = record.repository.read(&reference, "Version")?;
    let base = load_base(record, &model, current, selected["merge"] == true)?;
    let directory = scratch::Directory::create()?;
    let material = materialization::prepare(
        &materialization::Input {
            root: &record.request.root,
            directory: &directory.0,
            current,
            version: &version,
            reference: &reference,
            selection: selected,
            base: base
                .as_ref()
                .map(|(hash, version)| (hash.as_str(), version)),
            options: &record.request.options,
        },
        &record.repository,
        &mut plan.transitions,
        snapshots,
    )?;
    plan.result["components"]
        .as_array_mut()
        .ok_or_else(|| invalid("command results"))?
        .push(material.output.clone());
    if material.has_conflicts && record.request.options.strategy.as_deref() == Some("manual") {
        plan.result["leftUnresolvedConflicts"] = json!(true);
    }
    plan.materials.push(material);
    plan.directories.push(directory);
    Ok(())
}

pub(super) fn validate_sources(plan: &Planned) -> io::Result<()> {
    let files = plan.captured
        .iter()
        .flat_map(|captured| {
            captured.files
                .as_array()
                .into_iter()
                .flatten()
        })
        .collect::<Vec<_>>();
    let mut total = 0;
    for file in files {
        let path = std::path::Path::new(
            file["path"].as_str().ok_or_else(|| invalid("command source path"))?,
        );
        let bytes = super::super::read::raw(path, crate::workspace::snapshots::MAX_BYTES - total)?;
        total += bytes.len();
        if super::super::hash(&bytes) != file["rawHash"] {
            return Err(invalid("command workspace source changed"));
        }
    }
    Ok(())
}

fn import_target(target: &Value, selection: &Value) -> io::Result<command_import::Target> {
    let identity = target["identity"].as_str().ok_or_else(|| invalid("command identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("command scoped identity"))?;
    let version =
        if selection["kind"] == "target" { &selection["version"] } else { &target["version"] };
    Ok(command_import::Target {
        scope: Some(scope.to_owned()),
        name: name.to_owned(),
        version: version
            .as_str()
            .ok_or_else(|| invalid("command selected version"))?
            .to_owned(),
    })
}

fn load_base(
    record: &mut Record,
    model: &Value,
    current: &capture::Captured,
    merge: bool,
) -> io::Result<Option<(String, Value)>> {
    if !merge {
        return Ok(None);
    }
    let hash = selection::versions::reference(model, &current.target.version)?;
    let version = record.repository.read(&hash, "Version")?;
    Ok(Some((hash, version)))
}

fn prepare_selections(
    record: &mut Record,
    plan: &mut Planned,
    selections: &[Value],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let order = selections
        .iter()
        .enumerate()
        .filter(|(_, selected)| selected["merge"] == true)
        .chain(
            selections
                .iter()
                .enumerate()
                .filter(|(_, selected)| selected["merge"] != true),
        );
    for (index, selected) in order {
        if selected["kind"] == "failure" {
            failure(&mut plan.result, &record.targets[index], selected)?;
        } else {
            prepare_one(record, plan, index, selected, snapshots)?;
        }
    }
    Ok(())
}

fn modification(
    record: &mut Record,
    captured: &capture::Captured,
    model: Option<&Value>,
    remote: Option<&str>,
    histories: &history::State,
) -> io::Result<(bool, bool)> {
    let identity = &captured.target.identity;
    let mut staged = histories.clone();
    if let Some(model) = model {
        if record.repository.read(&super::super::hash(identity.as_bytes()), "Component")? != *model
        {
            return Err(invalid("command model changed"));
        }
        let hash = selection::versions::reference(model, &captured.target.version)?;
        let version = record.repository.read(&hash, "Version")?;
        let modified = comparison::compare(&captured.target, &captured.metadata, &version)?["modified"]
            == true;
        let distance = staged.distance(
            &record.request.root,
            identity,
            model,
            [model["head"].as_str(), remote],
            &mut record.repository,
        )?;
        Ok((
            modified,
            !distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
                && !distance["targetOnly"].as_array().is_some_and(Vec::is_empty),
        ))
    } else {
        Ok((false, false))
    }
}

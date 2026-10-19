mod checkout_lane;
mod checkout_scope;
mod checkout_select;
mod history_replay;
mod missing_reset;
mod reset_comparison;
use super::{
    super::{invalid, status_models::comparison},
    Record, capture, history, input, materialization, repository, scratch, selection,
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
    checkout_captured(record, current, semver, snapshots, pool, false)
}

pub(super) fn checkout_reset(
    record: &mut Record,
    current: Vec<Value>,
    semver: &Value,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Planned> {
    validate_current_inner(record, &current, true)?;
    checkout_captured(record, current, semver, snapshots, pool, true)
}

fn checkout_captured(
    record: &mut Record,
    current: Vec<Value>,
    semver: &Value,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
    recovery_reset: bool,
) -> io::Result<Planned> {
    let captured = capture::all_for_checkout(&record.request.root, current, snapshots, pool)?;
    let mut plan = Planned {
        captured,
        transitions: checkout_transition::State::default(),
        history: history::State::default(),
        merge: None,
        materials: Vec::new(),
        directories: Vec::new(),
        result: json!({"components":[],"failedComponents":[],"removedComponents":[]}),
    };
    if super::lane_history::phase(&record.request.options).is_some() {
        plan.result["newFromLaneAdded"] = json!(false);
    }
    super::lane_history::planning::attach(record, &mut plan)?;
    let selections = select_captured(record, &mut plan, semver, recovery_reset)?;
    import_selected(record, &selections)?;
    prepare_selections(record, &mut plan, &selections, snapshots)?;
    if super::checkout_stash::loading(&record.request.options) {
        super::checkout_stash::materialize(record, &mut plan, snapshots)?;
    }
    missing_reset::report_if_applicable(record, &mut plan, recovery_reset)?;
    if record.request.operation == input::Operation::Checkout
        && record.request.options.to.as_deref() == Some("head")
        && record.context.get("lane").is_some()
    {
        checkout_lane::prepare(record, &mut plan, snapshots)?;
    }
    checkout_scope::prepare_if_enabled(record, &mut plan, snapshots)?;
    if let Some(to) = record.request.options.to.as_deref()
        && !matches!(to, "head" | "latest" | "reset" | "main")
        && !to.starts_with("head~")
    {
        plan.result["version"] = json!(to);
    }
    Ok(plan)
}

pub(super) fn validate_current(record: &Record, current: &[Value]) -> io::Result<()> {
    validate_current_inner(record, current, false)
}
fn validate_current_inner(
    record: &Record,
    current: &[Value],
    recovery_reset: bool,
) -> io::Result<()> {
    if current.len() != record.targets.len() {
        return Err(invalid("command capture selection"));
    }
    for (current, target) in current.iter().zip(&record.targets) {
        if ["identity", "directory", "version"]
            .iter()
            .any(|key| current[key] != target[key])
        {
            return Err(invalid("command capture target changed"));
        }
        if recovery_reset && record.context["callbackLifecycle"] != true {
            super::reset_config::validate_target(target)?;
        }
    }
    Ok(())
}
fn lane_head<'a>(context: &'a Value, identity: &str) -> Option<&'a str> {
    let (scope, name) = identity.split_once('/')?;
    context["lane"]["current"]["value"]["components"]
        .as_array()?
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
        .and_then(|row| row["head"].as_str())
}
fn import_selected(record: &mut Record, selections: &[Value]) -> io::Result<()> {
    // Stash snapshots are detached local Versions, never published model ancestry.
    // Read Version/Source objects through the retained repository instead of trying
    // to resolve a remote for a hash intentionally absent from ModelComponent.
    if super::checkout_stash::loading(&record.request.options) {
        return Ok(());
    }
    let mut expanded = expanded_imports(record, selections)?;
    if record.request.operation == input::Operation::Switch {
        super::switch::progress::additions(&record.context, &mut expanded)?;
        record.context["switchCheckoutImport"] =
            record.repository.prepare_switch_versions(&expanded)?;
        Ok(())
    } else if super::lane_history::phase(&record.request.options).is_some() {
        super::lane_history::progress::import(record, &expanded)
    } else {
        record.repository.prepare_versions(&expanded)
    }
}
fn expanded_imports(
    record: &Record,
    selections: &[Value],
) -> io::Result<Vec<command_import::Target>> {
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
    Ok(expanded)
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
pub(super) fn prepare_one(
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
    let base = load_base(record, &model, current, selected["merge"] == true, &version)?;
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
        .filter(|captured| !captured.model_backed)
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
    target: &Value,
) -> io::Result<Option<(String, Value)>> {
    if !merge {
        return Ok(None);
    }
    let hash = if super::checkout_stash::loading(&record.request.options) {
        match target["parents"]
            .as_array()
            .and_then(|parents| parents.first())
            .and_then(Value::as_str)
        {
            Some(parent) => parent.to_owned(),
            None => selection::versions::reference(model, &current.target.version)?,
        }
    } else {
        selection::versions::reference(model, &current.target.version)?
    };
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
    recovery_reset: bool,
) -> io::Result<(bool, bool)> {
    let identity = &captured.target.identity;
    if record.request.operation == input::Operation::Switch {
        return switch_modification(record, captured, model);
    }
    let mut staged = histories.clone();
    let Some(model) = model else {
        if recovery_reset && reset_comparison::incomplete(&captured.target.current) {
            return Err(invalid("reset Source comparison requires a stored component"));
        }
        return Ok((false, false));
    };
    if record.repository.read(&super::super::hash(identity.as_bytes()), "Component")? != *model {
        return Err(invalid("command model changed"));
    }
    let hash = selection::versions::reference(model, &captured.target.version)?;
    let version = record.repository.read(&hash, "Version")?;
    let modified = if recovery_reset && reset_comparison::incomplete(&captured.target.current) {
        reset_comparison::prove_changed(&captured.metadata, &version)?;
        true
    } else {
        comparison::compare(&captured.target, &captured.metadata, &version)?["modified"] == true
    };
    let source = super::lane_history::heads::source(
        &record.request.options,
        &record.context,
        identity,
        model,
    );
    let distance = staged.distance(
        &record.request.root,
        identity,
        model,
        [source, remote],
        &mut record.repository,
    )?;
    Ok((
        modified,
        !distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
            && !distance["targetOnly"].as_array().is_some_and(Vec::is_empty),
    ))
}

fn switch_modification(
    record: &mut Record,
    captured: &capture::Captured,
    model: Option<&Value>,
) -> io::Result<(bool, bool)> {
    let model = model.ok_or_else(|| invalid("switch model missing"))?;
    let hash = selection::versions::reference(model, &captured.target.version)?;
    let version = record.repository.read(&hash, "Version")?;
    let modified =
        comparison::compare(&captured.target, &captured.metadata, &version)?["modified"] == true;
    Ok((modified, false))
}

fn select_captured(
    record: &mut Record,
    plan: &mut Planned,
    semver: &Value,
    recovery_reset: bool,
) -> io::Result<Vec<Value>> {
    let mut selections = Vec::new();
    for (index, captured) in plan.captured.iter().enumerate() {
        selections.push(checkout_select::select(
            record,
            index,
            captured,
            semver,
            &mut plan.history,
            &mut plan.transitions,
            recovery_reset,
        )?);
    }
    Ok(selections)
}

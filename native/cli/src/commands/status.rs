//! Native `bit status --json` (`s -j`): the workspace engine of
//! `bit-object-import` reads the workspace, models and dependency caches;
//! this module computes the policy, ignore and semver inputs Node computed.
//! Without `--json`, `report` formats the same result like `StatusCmd.report`.
//!
//! It reuses valid dependency cache entries or detects dependencies afresh.
//! With `no-fs-cache` it always detects afresh and writes no cache entries.
//! Component-level dependency policies, other environments and every other
//! input this module cannot prove declines to the Node.js CLI.

pub(super) mod cache;
pub(super) mod capture;
pub(super) mod fresh;
pub(super) mod grammar;
pub(super) mod issues;
pub(super) mod js;
pub(super) mod policy;

pub(super) mod collate;
pub(super) use delete::DeleteGraph;

mod delete;
mod lane_refresh;
mod loader;
mod report;

use super::{color::Chalk, engine::Engine, workspace_command};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use issues::Component;
use js::{array, decline, text};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "status", aliases: &["s"], run };

/// `--json`, or the report with its flags.
enum Mode {
    Json(bool),
    Report(report::Flags),
    /// `--quick`, with `--json` or not.
    Quick(bool),
}

fn mode(args: &[OsString]) -> Option<Mode> {
    if let Some(lanes) = json_mode(args) {
        return Some(Mode::Json(lanes));
    }
    let json = |flag: &OsString| flag == "--json" || flag == "-j";
    match args {
        [_, flag] if flag == "--quick" => return Some(Mode::Quick(false)),
        [_, first, second]
            if (first == "--quick" && json(second)) || (json(first) && second == "--quick") =>
        {
            return Some(Mode::Quick(true));
        }
        _ => {}
    }
    let arguments = workspace_command::utf8_args(args)?;
    report::parse(&arguments[1..]).map(Mode::Report)
}

fn json_mode(args: &[OsString]) -> Option<bool> {
    let json = |flag: &OsString| flag == "--json" || flag == "-j";
    match args {
        [_, flag] if json(flag) => Some(false),
        [_, first, second]
            if (json(first) && second == "--lanes") || (first == "--lanes" && json(second)) =>
        {
            Some(true)
        }
        _ => None,
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(mode) = mode(args) else {
        return Ok(Outcome::Declined("flags outside the native `status` grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if !collate::root_locale() {
        return Ok(Outcome::Declined("the locale may collate ids differently".to_string()));
    }
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    match mode {
        Mode::Json(lanes) => json_status(&root, Path::new(&home), args, lanes),
        Mode::Report(flags) => report_status(&root, Path::new(&home), args, &flags),
        // `statusMini`: the file changes only.
        Mode::Quick(json) => super::mini_status::quick(args, json),
    }
}

/// `bit status --json`.
fn json_status(root: &Path, home: &Path, args: &[OsString], lanes: bool) -> io::Result<Outcome> {
    let result = match read(root, home, lanes, |_, _| Ok(())) {
        Ok((result, (), _)) => result,
        Err(ReadFailure::Declined(error)) => {
            return Ok(Outcome::Declined(format!("status: {error}")));
        }
        Err(ReadFailure::Committed(error)) => return Err(error),
    };
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// `StatusCmd.report`: the loader's lines, then the formatted status.
fn report_status(
    root: &Path,
    home: &Path,
    args: &[OsString],
    flags: &report::Flags,
) -> io::Result<Outcome> {
    let (output, loaded, loads, progress) =
        match read(root, home, flags.lanes, |result, context| {
            prepare_report(result, context, flags, Chalk::detect(args))
        }) {
            Ok((_, (output, loaded, loads), progress)) => (output, loaded, loads, progress),
            Err(ReadFailure::Declined(error)) => {
                return Ok(Outcome::Declined(format!("status: {error}")));
            }
            Err(ReadFailure::Committed(error)) => return Err(error),
        };
    let report =
        workspace_command::results::Report { data: output.data, code: output.code, details: None };
    workspace_command::execute_with(root, args, "status", &report, |output| {
        loader::render(output, loaded, loads, &progress)
    })
}

fn prepare_report(
    result: &Value,
    context: &Value,
    flags: &report::Flags,
    chalk: Chalk,
) -> io::Result<(report::Output, usize, usize)> {
    let output = report::report(result, context, flags, chalk)?;
    let loaded = array(context.get("targets"), "targets")?
        .iter()
        .filter(|target| target["locallyRemoved"] != true)
        .count();
    let loads = if loaded == 0 {
        0
    } else {
        3 + usize::from(!array(result.get("modifiedComponents"), "modified")?.is_empty())
    };
    Ok((output, loaded, loads))
}

/// The status result, after its history plans are
/// committed. `prepare` runs on the result and the context before the commit.
enum ReadFailure {
    Declined(io::Error),
    Committed(io::Error),
}

impl From<io::Error> for ReadFailure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error)
    }
}

fn read<Prepared>(
    root: &Path,
    home: &Path,
    lanes: bool,
    prepare: impl FnOnce(&Value, &Value) -> io::Result<Prepared>,
) -> Result<(Value, Prepared, loader::Progress), ReadFailure> {
    let mut engine = Engine::new()?;
    let context: Value =
        engine.request(&json!({"kind": "statusContext", "root": root, "home": home}))?;
    let (mut result, capture) = local_result(&mut engine, root, home, &context)?;
    let mut refreshes =
        lane_refresh::Refreshes::prepare(&mut engine, root, &context, &result, lanes)?;
    refreshes.attach(&mut result, &context);
    result["remotelySoftRemoved"] = json!(capture.remotely_removed);
    sort_rows(&mut result)?;
    let prepared = prepare(&result, &context)?;
    capture::commit(&mut engine, root, &context, &capture).map_err(ReadFailure::Committed)?;
    let progress = refreshes.progress(&context);
    refreshes.apply(&mut engine).map_err(ReadFailure::Committed)?;
    Ok((result, prepared, progress))
}

fn local_result(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
) -> io::Result<(Value, capture::Capture)> {
    let capture = status_capture(engine, root, home, context)?;
    let compared: Value = engine.request(
        &json!({"kind": "statusCompare", "root": root, "targets": capture.comparisons}),
    )?;
    let issues = issues::collect(root, context, &active_components(context, &capture.components)?)?
        .ok_or_else(|| decline("status issues need canonical loading"))?;
    let targets =
        result_targets(context, &capture.components, &capture.invalid, &compared, &issues)?;
    let semver = grammar::snapshot(semver_values(context, &targets)?.iter().map(String::as_str))
        .ok_or_else(|| decline("status semver grammar limits"))?;
    let current_lane_id = current_lane_id(context)?;
    let result: Value = engine.request(&json!({
        "kind": "statusResult",
        "currentLaneId": current_lane_id,
        "targets": targets,
        "models": context["models"],
        "histories": context["histories"],
        "semver": semver,
        "unavailableOnMain": context["unavailableOnMain"],
        "updateDependents": context["updateDependents"],
    }))?;
    Ok((result, capture))
}

/// Inspect a staged component for local removal without committing status caches.
pub(super) fn clean_staged_component(root: &Path, identity: &str) -> io::Result<bool> {
    clean_component_for_remove(root, identity, true)
}

pub(super) fn clean_imported_component(root: &Path, identity: &str) -> io::Result<bool> {
    clean_component_for_remove(root, identity, false)
}

fn clean_component_for_remove(
    root: &Path,
    identity: &str,
    staged_required: bool,
) -> io::Result<bool> {
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    let mut engine = Engine::new()?;
    let context: Value = engine.request(&json!({
        "kind": "statusContext",
        "root": root,
        "home": Path::new(&home),
    }))?;
    let (result, _) = local_result(&mut engine, root, Path::new(&home), &context)?;
    let staged = array(result.get("stagedComponents"), "staged")?;
    let modified = array(result.get("modifiedComponents"), "modified")?;
    let invalid = array(result.get("invalidComponents"), "invalid")?;
    Ok((staged
        .iter()
        .any(|row| row["id"] == identity)
        == staged_required)
        && !modified
            .iter()
            .any(|row| row == identity)
        && invalid.is_empty())
}

fn active_components(
    context: &Value,
    components: &[issues::Component],
) -> io::Result<Vec<issues::Component>> {
    Ok(array(context.get("targets"), "targets")?
        .iter()
        .zip(components)
        .filter(|(target, _)| target["locallyRemoved"] != true)
        .map(|(_, component)| component.clone())
        .collect())
}

fn current_lane_id(context: &Value) -> io::Result<String> {
    if let Some(id) = context.get("currentLaneId") {
        return Ok(text(Some(id))?.to_string());
    }
    let scope = text(
        context
            .get("scope")
            .and_then(|scope| scope.get("name")),
    )?;
    Ok(format!("{scope}/main"))
}

fn status_capture(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
) -> io::Result<capture::Capture> {
    let targets = array(context.get("targets"), "targets")?;
    capture::capture_with(
        engine,
        root,
        home,
        context,
        targets,
        capture::CaptureOptions { missing_status_invalid: true, ..Default::default() },
    )
}

/// The rows `statusResult` reports, one per bitmap target.
fn result_targets(
    context: &Value,
    components: &[Component],
    invalid: &std::collections::HashMap<String, Value>,
    compared: &Value,
    issues: &[Value],
) -> io::Result<Vec<Value>> {
    let comparisons = array(compared.get("comparisons"), "comparisons")?;
    let targets = array(context.get("targets"), "targets")?;
    targets
        .iter()
        .zip(components)
        .map(|(target, component)| {
            let identity = &target["identity"];
            let modified = comparisons
                .iter()
                .find(|row| row["identity"] == *identity)
                .and_then(|row| js::nullish(row.get("modified")))
                .cloned()
                .unwrap_or(Value::Bool(false));
            let issues = issues
                .iter()
                .find(|row| row["id"] == *identity)
                .map_or_else(|| json!([]), |row| row["issues"].clone());
            let mut row = json!({
                "identity": identity,
                "version": target["version"],
                "modified": modified,
                "dependencies": component.dependencies,
                "issues": issues,
                "bitmapState": {
                    "localOnly": target["localOnly"],
                    "softTagged": target["softTagged"],
                    "locallyRemoved": target["locallyRemoved"],
                },
            });
            if let Some(error) = identity
                .as_str()
                .and_then(|id| invalid.get(id))
            {
                row["invalid"] = error.clone();
            }
            Ok(row)
        })
        .collect()
}

/// Every version string the semver grammar must describe.
fn semver_values(context: &Value, targets: &[Value]) -> io::Result<Vec<String>> {
    let mut values: Vec<String> = Vec::new();
    for target in targets {
        values.push(text(target.get("version"))?.to_string());
    }
    for target in targets {
        for dependency in array(target.get("dependencies"), "dependencies")? {
            let dependency = text(Some(dependency))?;
            values.push(
                dependency
                    .split('@')
                    .nth(1)
                    .unwrap_or_default()
                    .to_string(),
            );
        }
    }
    for model in array(context.get("models"), "models")? {
        model_versions(model, &mut values)?;
    }
    for history in array(context.get("histories"), "histories")? {
        values.push(nullish_text(history.get("remoteHead"))?);
    }
    Ok(values)
}

/// A model's version names, orphaned versions and head.
fn model_versions(model: &Value, values: &mut Vec<String>) -> io::Result<()> {
    for field in ["versions", "orphanedVersions"] {
        if let Some(versions) = js::nullish(model.get(field)) {
            values.extend(js::object(versions)?.keys().cloned());
        }
    }
    values.push(nullish_text(model.get("head"))?);
    Ok(())
}

/// `value ?? ''` for a string field.
fn nullish_text(value: Option<&Value>) -> io::Result<String> {
    match js::nullish(value) {
        None => Ok(String::new()),
        Some(value) => text(Some(value)).map(str::to_string),
    }
}

/// Every array of the result except `importPendingComponents`, sorted by id
/// with `localeCompare`.
fn sort_rows(result: &mut Value) -> io::Result<()> {
    let result = result.as_object_mut().ok_or_else(|| decline("status result"))?;
    for (key, rows) in result.iter_mut() {
        let Some(rows) = rows
            .as_array_mut()
            .filter(|_| key != "importPendingComponents")
        else {
            continue;
        };
        let ids = rows
            .iter()
            .map(sort_id)
            .collect::<io::Result<Vec<_>>>()?;
        if !ids.iter().all(|id| collate::supported(id)) {
            return Err(decline("status ids outside the native collation"));
        }
        let mut order: Vec<usize> = (0..rows.len()).collect();
        order.sort_by(|&left, &right| collate::compare(&ids[left], &ids[right]));
        *rows = order
            .into_iter()
            .map(|index| rows[index].clone())
            .collect();
    }
    Ok(())
}

/// `typeof row === 'string' ? row : row.id`.
fn sort_id(row: &Value) -> io::Result<String> {
    match row {
        Value::String(id) => Ok(id.clone()),
        _ => text(row.get("id")).map(str::to_string),
    }
}

//! Native `bit status --json` (`s -j`), the flow of `readRustStatus` and
//! `captureRustClientCurrent` in the Node.js glue: the workspace engine of
//! `bit-object-import` reads the workspace, models and dependency caches;
//! this module computes the policy, ignore and semver inputs Node computed.
//!
//! It runs only on a warm dependency cache. A component whose dependencies
//! need fresh detection, an invalidated cache, the `no-fs-cache` feature,
//! component-level dependency policies, other environments and every other
//! input the glue could not prove decline to the Node.js CLI, which then
//! writes the cache for the next run.

pub(super) mod cache;
pub(super) mod capture;
pub(super) mod fresh;
pub(super) mod grammar;
pub(super) mod js;
pub(super) mod policy;

mod collate;
mod issues;

use super::engine::Engine;
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

fn run(args: &[OsString]) -> io::Result<Outcome> {
    if !matches!(args, [_, flag] if flag == "--json" || flag == "-j") {
        return Ok(Outcome::Declined("only `--json` runs natively".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if !collate::root_locale() {
        return Ok(Outcome::Declined("the locale may collate ids differently".to_string()));
    }
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    let result = match read(&root, Path::new(&home)) {
        Ok(result) => result,
        Err(error) => return Ok(Outcome::Declined(format!("status: {error}"))),
    };
    let history = History::start(&root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// `readRustStatus`: the status result, after its history plans are committed.
fn read(root: &Path, home: &Path) -> io::Result<Value> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let mut engine = Engine::new()?;
    let context: Value =
        engine.request(&json!({"kind": "statusContext", "root": root, "home": home}))?;
    let targets = array(context.get("targets"), "targets")?;
    let capture = capture::capture(&mut engine, root, home, &context, targets)?;
    let compared: Value = engine.request(
        &json!({"kind": "statusCompare", "root": root, "targets": capture.comparisons}),
    )?;
    let issues = issues::collect(root, &context, &capture.components)?
        .ok_or_else(|| decline("status issues need canonical loading"))?;
    let targets = result_targets(&context, &capture.components, &compared, &issues)?;
    let semver = grammar::snapshot(semver_values(&context, &targets)?.iter().map(String::as_str))
        .ok_or_else(|| decline("status semver grammar limits"))?;
    let scope = text(
        context
            .get("scope")
            .and_then(|scope| scope.get("name")),
    )?;
    let mut result: Value = engine.request(&json!({
        "kind": "statusResult",
        "currentLaneId": format!("{scope}/main"),
        "targets": targets,
        "models": context["models"],
        "histories": context["histories"],
        "semver": semver,
    }))?;
    sort_rows(&mut result)?;
    capture::commit(&mut engine, root, &context, &capture)?;
    Ok(result)
}

/// The rows `statusResult` reports, one per bitmap target.
fn result_targets(
    context: &Value,
    components: &[Component],
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
            Ok(json!({
                "identity": identity,
                "version": target["version"],
                "modified": modified,
                "dependencies": component.dependencies,
                "issues": issues,
            }))
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

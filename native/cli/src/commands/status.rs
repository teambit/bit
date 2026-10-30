//! Native `bit status --json` (`s -j`): the workspace engine of
//! `bit-object-import` reads the workspace, models and dependency caches;
//! this module computes the policy, ignore and semver inputs Node computed.
//! Without `--json`, `report` formats the same result like `StatusCmd.report`.
//!
//! It reuses valid dependency cache entries or detects dependencies afresh.
//! With `no-fs-cache` it always detects afresh and writes no cache entries.
//! Harmony callbacks supply extension facts while Rust owns repository state,
//! inventory, dependency projection and comparison.

pub(super) mod autosync;
pub(super) mod cache;
pub(super) mod capture;
pub(super) mod environments;
pub(super) mod fresh;
pub(super) mod grammar;
pub(super) mod issues;
pub(super) mod js;
pub(super) mod policy;
pub(in crate::commands) mod report;

pub(super) mod collate;

mod lane_refresh;
mod loader;
mod reading;
mod sorting;
mod workspace_issues;

use super::{color::Chalk, engine::Engine, workspace_command};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use issues::Component;
use js::{array, decline, text};
use reading::{ReadFailure, read};
use serde_json::{Value, json};
use sorting::sort_rows;
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
    Json(report::Flags),
    Report(report::Flags),
    /// `--quick`, with `--json` or not.
    Quick(bool),
}

fn mode(args: &[OsString]) -> Option<Mode> {
    let arguments = workspace_command::utf8_args(args)?;
    let (filtered, _) = strip_log_flags(&arguments[1..]);
    let json = filtered
        .iter()
        .fold(false, |acc, &arg| match arg {
            "--json" | "-j" | "--json=true" => true,
            "--json=false" => false,
            _ => acc,
        });
    let quick = filtered
        .iter()
        .fold(false, |acc, &arg| match arg {
            "--quick" | "--quick=true" => true,
            "--quick=false" => false,
            _ => acc,
        });
    let report_args = filtered
        .iter()
        .copied()
        .filter(|arg| !is_mode_flag(arg))
        .collect::<Vec<_>>();
    let flags = report::parse(&report_args)?;
    if quick {
        Some(Mode::Quick(json))
    } else if json {
        Some(Mode::Json(flags))
    } else {
        Some(Mode::Report(flags))
    }
}

fn is_mode_flag(arg: &str) -> bool {
    matches!(
        arg,
        "--json"
            | "-j"
            | "--json=true"
            | "--json=false"
            | "--quick"
            | "--quick=true"
            | "--quick=false"
            | "--no-color",
    )
}

/// Strip `--log`, `--log=<level>`, or `--log <level>` from `args` and return whether logging was enabled.
fn strip_log_flags<'a>(args: &[&'a str]) -> (Vec<&'a str>, bool) {
    let mut out = Vec::with_capacity(args.len());
    let mut logged = false;
    let mut iter = args.iter().copied().peekable();
    while let Some(arg) = iter.next() {
        if arg == "--log" {
            logged = true;
            if iter
                .peek()
                .is_some_and(|next| {
                    matches!(
                        *next,
                        "trace"
                            | "debug"
                            | "info"
                            | "warn"
                            | "error"
                            | "fatal"
                            | "10"
                            | "20"
                            | "30"
                            | "40"
                            | "50"
                            | "60",
                    )
                })
            {
                iter.next();
            }
        } else if arg.starts_with("--log=") {
            logged = true;
        } else {
            out.push(arg);
        }
    }
    (out, logged)
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(mode) = mode(args) else {
        return Ok(Outcome::Declined("flags outside the native `status` grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if let Some(err_msg) = workspace_config_error(&root) {
        return workspace_command::execute_without_loader(&root, args, "status", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    if workspace_command::utf8_args(args).is_some_and(|argv| strip_log_flags(&argv[1..]).1) {
        writeln!(io::stdout(), r#"[*] started a new command: "status" with the following args:"#)?;
    }
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    match mode {
        Mode::Json(flags) => json_status(&root, Path::new(&home), args, &flags),
        Mode::Report(flags) => report_status(&root, Path::new(&home), args, &flags),
        // `statusMini`: the file changes only.
        Mode::Quick(json) => super::mini_status::quick(args, json),
    }
}

/// Validate `workspace.jsonc` for invalid top-level keys, conflicting rootComponent, or unknown core harmony aspects in variants.
fn workspace_config_error(root: &Path) -> Option<String> {
    let bytes = std::fs::read(root.join("workspace.jsonc")).ok()?;
    let ws = bit_object_import::parse_jsonc(&bytes).ok()?;
    let dep_resolver = &ws["teambit.dependencies/dependency-resolver"];
    if dep_resolver["externalPackageManager"] == true && dep_resolver["rootComponent"] == true {
        return Some(
            "rootComponent cannot be true when externalPackageManager is enabled".to_owned(),
        );
    }
    let obj = ws.as_object()?;
    invalid_top_level_key(obj).or_else(|| unknown_variant_harmony_aspect(obj))
}

fn invalid_top_level_key(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let key = obj
        .keys()
        .find(|key| *key != "$schema" && !key.contains('/'))?;
    Some(format!(r#"unable to parse the component-id "{key}" from the workspace.jsonc file"#))
}

fn unknown_variant_harmony_aspect(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let variants = obj.get("teambit.workspace/variants")?.as_object()?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .unwrap_or_default();
    let aspect_key = variants
        .values()
        .filter_map(Value::as_object)
        .flat_map(serde_json::Map::keys)
        .find(|aspect_key| is_unknown_harmony_aspect(aspect_key, &core))?;
    Some(format!(
        r#"error: component "{aspect_key}" was not found.
your workspace.jsonc has this component-id set in the "teambit.workspace/variants" section"#,
    ))
}

fn is_unknown_harmony_aspect(aspect_key: &str, core: &[String]) -> bool {
    let bare = aspect_key
        .split('@')
        .next()
        .unwrap_or(aspect_key);
    bare.starts_with("teambit.harmony/")
        && !core
            .iter()
            .any(|core_id| core_id == bare)
        && !matches!(bare, "teambit.harmony/bit-custom-aspect" | "teambit.harmony/harmony")
}

fn json_status(
    root: &Path,
    home: &Path,
    args: &[OsString],
    flags: &report::Flags,
) -> io::Result<Outcome> {
    let (mut result, progress) = match read(root, home, flags, |_, _| Ok(())) {
        Ok((result, (), progress)) => (result, progress),
        Err(ReadFailure::Declined(error)) => {
            return Ok(Outcome::Declined(format!("status: {error}")));
        }
        Err(ReadFailure::Committed(error)) => return Err(error),
    };
    report::color_issue_data(&mut result, Chalk::detect(args));
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(progress.startup_stdout.as_bytes())?;
    stdout.write_all(progress.load_stdout.as_bytes())?;
    stdout.write_all(progress.issue_stdout.as_bytes())?;
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
    let (output, loaded, loads, progress) = match read(root, home, flags, |result, context| {
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
    io::stdout().write_all(progress.startup_stdout.as_bytes())?;
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
    environments: Option<environments::Environments>,
) -> io::Result<capture::Capture> {
    let targets = array(context.get("targets"), "targets")?;
    capture::capture_with(
        engine,
        root,
        home,
        context,
        targets,
        capture::CaptureOptions {
            environments,
            missing_status_invalid: true,
            ..Default::default()
        },
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

/// Consumer.onDestroy removes temporary versioning output after a completed read.
pub(super) fn cleanup_temporary(root: &Path) -> io::Result<()> {
    let path = root.join(".bitTmp");
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            std::fs::remove_dir_all(path)
        }
        Ok(_) => std::fs::remove_file(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

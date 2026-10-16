//! Native workspace `bit diff` and `bit diff <component>`: the shared
//! status capture, the workspace engine's `workspaceDiff`, and the file and
//! metadata formatting of `@teambit/legacy.component-diff`.
//!
//! Patterns this module does not resolve, and everything the status capture
//! declines run on the Node.js CLI.

pub(super) mod git;
pub(super) mod selection;

pub(super) mod files;
mod metadata;
mod options;
mod order;
mod parent;
mod presentation;
mod progress;
mod remote;
mod report;
mod result_files;

use presentation::run_report;
use result_files::rows;
use selection::select;

use super::{
    color::Chalk,
    engine::Engine,
    status::{
        capture::{self, Capture},
        js::{array, decline, text, truthy},
    },
    workspace_command,
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "diff", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("the arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native diff grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    run_workspace(&root, args, &options)
}

fn run_workspace(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
) -> io::Result<Outcome> {
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    let mut startup = super::status::autosync::Startup::default();
    let mut prepared =
        match read(root, Path::new(&home), options, Chalk::detect(args), &mut startup) {
            Ok(result) => result,
            Err(error) if startup.committed => {
                io::stdout().write_all(startup.stdout.as_bytes())?;
                return Err(error);
            }
            Err(error) => return Ok(Outcome::Declined(format!("diff: {error}"))),
        };
    let mut result = report::filtered(&prepared.result, options)?;
    if !options.output.json {
        io::stdout().write_all(startup.stdout.as_bytes())?;
        return run_report(root, args, options, &result, &mut prepared);
    }
    report::json(&mut result)?;
    let history = History::start(root, args);
    prepared.commit(root)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(startup.stdout.as_bytes())?;
    stdout.write_all(capture::callback_startup_stdout(&prepared.capture).as_bytes())?;
    stdout.write_all(capture::callback_load_stdout(&prepared.capture).as_bytes())?;
    stdout.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

struct Prepared {
    engine: Engine,
    context: Value,
    capture: Capture,
    result: Value,
    loaded: usize,
    selector_loads: Vec<usize>,
}

impl Prepared {
    fn commit(&mut self, root: &Path) -> io::Result<()> {
        capture::commit(&mut self.engine, root, &self.context, &self.capture)?;
        if let Some(token) = import_token(&self.capture) {
            super::import::apply_status_refresh(&mut self.engine, token)?;
        }
        super::status::cleanup_temporary(root)?;
        Ok(())
    }
}

fn import_token(capture: &Capture) -> Option<&Value> {
    capture.captured
        .first()
        .and_then(|target| target.get("_importToken"))
        .filter(|token| !token.is_null())
}

/// The diff of the selected components.
fn read(
    root: &Path,
    home: &Path,
    options: &options::Options,
    chalk: Chalk,
    startup: &mut super::status::autosync::Startup,
) -> io::Result<Prepared> {
    git::executable(root)?;
    let mut engine = Engine::new()?;
    let (context, environments) = super::status::environments::read_context(
        &mut engine,
        root,
        home,
        options.pattern.is_none(),
        options.pattern.as_deref(),
        startup,
    )?;
    let selected = select(array(context.get("targets"), "targets")?, options.pattern.as_deref())?;
    let mut capture = current(&mut engine, root, home, &context, &selected, environments)?;
    let (selected, selector_loads) = selection::after_capture(
        &mut engine,
        root,
        &context,
        &selected,
        options.pattern.as_deref(),
        &mut capture,
    )?;
    let token = remote::prepare(&mut engine, root, &selected, options)?;
    attach(&mut capture, &selected, options, token.as_ref());
    let result =
        render_selection(&mut engine, root, &context, &capture, &selected, options, chalk)?;
    Ok(Prepared { engine, context, capture, result, loaded: selected.len(), selector_loads })
}

fn current(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    context: &Value,
    selected: &[Value],
    environments: super::status::environments::Environments,
) -> io::Result<Capture> {
    capture::capture_with(
        engine,
        root,
        home,
        context,
        selected,
        capture::CaptureOptions {
            environments: Some(environments.with_issue_facts(false)),
            allow_special_states: true,
            missing_checkout_reset: selected
                .iter()
                .any(|target| target["locallyRemoved"] == true),
            ..Default::default()
        },
    )
}

fn attach(
    capture: &mut Capture,
    selected: &[Value],
    options: &options::Options,
    token: Option<&Value>,
) {
    for target in &mut capture.captured {
        target["_removed"] = json!(
            remotely_removed(target)
                || selected
                    .iter()
                    .any(|selected| selected["identity"] == target["identity"]
                        && selected["locallyRemoved"] == true)
        );
        target["_verbose"] = json!(options.output.verbose);
        target["_importToken"] = token.cloned().unwrap_or(Value::Null);
    }
}

fn remotely_removed(target: &Value) -> bool {
    target["current"]["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    extension["name"] == "teambit.component/remove"
                        && extension["config"]["removed"] == true
                })
        })
}

fn render_selection(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    capture: &Capture,
    selected: &[Value],
    options: &options::Options,
    chalk: Chalk,
) -> io::Result<Value> {
    let pattern = options.pattern.as_deref();
    let from_version = options.versions.from.as_deref();
    let to_version = options.versions.to.as_deref();
    let output = if options.versions.parent {
        parent::read(parent::Request {
            engine,
            root,
            context,
            capture,
            selected,
            pattern,
            requested_version: from_version,
            chalk,
        })?
    } else {
        let result =
            comparison(engine, root, pattern, selected, capture, from_version, to_version)?;
        rows(&result, pattern.is_some())?
            .into_iter()
            .map(|row| one(context, capture, row, chalk, from_version, to_version))
            .collect::<io::Result<Vec<_>>>()?
    };
    Ok(Value::Array(output))
}

fn comparison(
    engine: &mut Engine,
    root: &Path,
    pattern: Option<&str>,
    selected: &[Value],
    capture: &Capture,
    from_version: Option<&str>,
    to_version: Option<&str>,
) -> io::Result<Value> {
    if let Some(to_version) = to_version {
        let from_version = from_version.ok_or_else(|| decline("diff target version absent"))?;
        let comparisons = selected
            .iter()
            .map(|target| {
                let identity = text(target.get("identity"))?;
                engine.request::<Value>(&json!({
                    "kind":"versionDiff","root":root,"identity":identity,
                    "fromVersion":from_version,"toVersion":to_version,"importToken":import_token(capture),
                    "gitExecutable":git::executable(root)?,"color":true,
                }))
            })
            .collect::<io::Result<Vec<_>>>()?;
        return Ok(json!({"comparisons":comparisons}));
    }
    let request: Vec<Value> = capture.captured
        .iter()
        .map(|row| diff_target(root, row, from_version))
        .collect::<io::Result<_>>()?;
    engine.request(&json!({
        "kind": "workspaceDiff",
        "root": root,
        "targets": request,
        "gitExecutable": git::executable(root)?,
        "importToken": import_token(capture),
        "color": true,
        "modifiedOnly": pattern.is_none(),
    }))
}

fn model<'c>(context: &'c Value, target: &Value) -> Option<&'c Value> {
    let identity = target.get("identity")?.as_str()?;
    context
        .get("models")?
        .as_array()?
        .iter()
        .find(|model| {
            let part = |key| {
                model
                    .get(key)
                    .and_then(Value::as_str)
                    .unwrap_or("undefined")
            };
            format!("{}/{}", part("scope"), part("name")) == identity
        })
}

/// A captured row as `workspaceDiff` takes it: without its peers, files in
/// the order the Node.js CLI's `globby` scan lists them.
fn diff_target(root: &Path, row: &Value, from_version: Option<&str>) -> io::Result<Value> {
    let mut row = row.clone();
    if row["_removed"] == true {
        row["files"] = json!([]);
    }
    let object = row.as_object_mut().ok_or_else(|| decline("diff target"))?;
    object.remove("peerDependencies");
    object.remove("_verbose");
    object.remove("_importToken");
    object.remove("_removed");
    if let Some(version) = from_version {
        object.insert("version".into(), json!(version));
    }
    let mut files: Vec<String> = array(object.get("files"), "files")?
        .iter()
        .map(|file| text(Some(file)).map(str::to_string))
        .collect::<io::Result<_>>()?;
    files = order::captured(
        &root.join(text(object.get("directory"))?),
        &files,
        object.get("sourceOverlays"),
    )?;
    object.insert("files".into(), json!(files));
    Ok(row)
}

struct Versions<'a> {
    left: &'a str,
    right: &'a str,
    historical: bool,
}

/// One `DiffJson` row.
fn one(
    context: &Value,
    capture: &Capture,
    row: &Value,
    chalk: Chalk,
    from_version: Option<&str>,
    to_version: Option<&str>,
) -> io::Result<Value> {
    let identity = text(row.get("identity"))?;
    let target = capture.captured
        .iter()
        .find(|item| item["identity"] == identity);
    let target = target.ok_or_else(|| decline("diff row without a captured target"))?;
    let version = target
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let versions = Versions {
        left: from_version.unwrap_or_else(|| version.unwrap_or("latest")),
        right: to_version.unwrap_or_else(|| version.unwrap_or("latest")),
        historical: to_version.is_some(),
    };
    let files_diff = result_files::files_diff(row, versions.left, versions.right)?;
    let fields_diff = if target["_removed"] == true && !versions.historical {
        None
    } else {
        match row
            .get("model")
            .filter(|stored| truthy(Some(stored)))
        {
            None => None,
            Some(stored) => fields_diff(context, target, stored, row, chalk, &versions)?,
        }
    };
    let mut output = json!({
        "id": identity,
        "_fullId": version.map_or_else(|| identity.to_string(), |version| format!("{identity}@{version}")),
        "hasDiff": !files_diff.is_empty() || fields_diff.is_some(),
        "filesDiff": files_diff,
    });
    if let Some(fields_diff) = fields_diff {
        output["fieldsDiff"] = json!(fields_diff);
    }
    Ok(output)
}

/// `diffMetadata` of the stored version and the workspace's current state.
fn fields_diff(
    context: &Value,
    target: &Value,
    stored: &Value,
    row: &Value,
    chalk: Chalk,
    versions: &Versions<'_>,
) -> io::Result<Option<Vec<Value>>> {
    let side = metadata::Component {
        target,
        model: model(context, target),
        verbose: target["_verbose"] == true,
    };
    let peers = if versions.historical {
        array(row["current"].get("peerDependencies"), "peer dependencies")?
    } else {
        array(target.get("peerDependencies"), "peer dependencies")?
    };
    let left_peers = if versions.historical {
        array(stored.get("peerDependencies"), "peer dependencies")?
    } else {
        &[]
    };
    let left = side.side(stored, left_peers, false)?.with_version(versions.left);
    let right = side
        .side(&row["current"], peers, !versions.historical)?
        .with_version(versions.right);
    metadata::diff(&left, &right, chalk)
}

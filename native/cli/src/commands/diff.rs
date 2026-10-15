//! Native workspace `bit diff` and `bit diff <component>`: the shared
//! status capture, the workspace engine's `workspaceDiff`, and the file and
//! metadata formatting of `@teambit/legacy.component-diff`.
//!
//! A configured git executable, a component whose model lacks a head,
//! patterns this module does not resolve, and everything the status capture
//! declines run on the Node.js CLI.

mod files;
mod metadata;
mod options;
mod report;
mod result_files;

use super::{
    color::Chalk,
    engine::Engine,
    inventory,
    status::{
        cache,
        capture::{self, Capture},
        js::{array, decline, text, truthy},
    },
    workspace_command::{self, results::Report},
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
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
    if cfg!(windows) {
        // Node.js lists directories in the file system's order there, not sorted.
        return Ok(Outcome::Declined("Windows directory order".to_string()));
    }
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
    let (result, loaded) = match read(
        root,
        Path::new(&home),
        options.pattern.as_deref(),
        options.versions.from.as_deref(),
        options.versions.to.as_deref(),
        Chalk::detect(args),
    ) {
        Ok(result) => result,
        Err(error) => return Ok(Outcome::Declined(format!("diff: {error}"))),
    };
    let mut result = report::filtered(&result, options)?;
    if !options.json {
        return run_report(root, args, options, &result, loaded);
    }
    report::json(&mut result)?;
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn run_report(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    result: &Value,
    loaded: usize,
) -> io::Result<Outcome> {
    let data = report::format(result, Chalk::detect(args), options)?;
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with(root, args, "diff", &report, |output| {
        render_progress(output, options, result, loaded);
        Ok(())
    })
}

fn render_progress(
    output: &bit_install::output::Output,
    options: &options::Options,
    result: &Value,
    loaded: usize,
) {
    if loaded > 0 {
        output.status(&format!("loading {loaded} component(s)"));
    }
    if options.versions.from.is_some() {
        let qualifier = if multi_version_import(options, result) { ", 2 versions" } else { "" };
        output.status(&format!("importing {loaded} components{qualifier} to show diff"));
        output.status(&format!("successfully imported {loaded} components to show diff"));
    }
    if options.pattern.is_none()
        && let Some(rows) = result.as_array()
        && !rows.is_empty()
    {
        output.status(&format!("loading {} component(s)", rows.len()));
    }
}

fn multi_version_import(options: &options::Options, result: &Value) -> bool {
    let (Some(from), Some(to)) = (&options.versions.from, &options.versions.to) else {
        return false;
    };
    if from == to {
        return false;
    }
    let current = result[0]["_fullId"]
        .as_str()
        .and_then(|id| id.rsplit_once('@'));
    current.is_some_and(|(_, version)| {
        version.len() != 40 || !version.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

/// The diff of the selected components.
fn read(
    root: &Path,
    home: &Path,
    pattern: Option<&str>,
    from_version: Option<&str>,
    to_version: Option<&str>,
    chalk: Chalk,
) -> io::Result<(Value, usize)> {
    if cache::no_fs_cache(root) || git_path_configured(root) {
        return Err(decline("no-fs-cache or a configured git executable"));
    }
    let mut engine = Engine::new()?;
    let context: Value = engine.request(&json!({
        "kind": "statusContext", "root": root, "home": home, "history": pattern.is_none(),
    }))?;
    let targets = array(context.get("targets"), "targets")?;
    validate_models(&context, targets)?;
    let selected = select(targets, pattern)?;
    let loaded = selected.len();
    let capture = capture::capture(&mut engine, root, home, &context, &selected)?;
    let result =
        comparison(&mut engine, root, pattern, &selected, &capture, from_version, to_version)?;
    let output = rows(&result, pattern.is_some())?
        .into_iter()
        .map(|row| one(&context, &capture, row, chalk, from_version, to_version))
        .collect::<io::Result<Vec<_>>>()?;
    capture::commit(&mut engine, root, &context, &capture)?;
    Ok((Value::Array(output), loaded))
}

fn validate_models(context: &Value, targets: &[Value]) -> io::Result<()> {
    if targets
        .iter()
        .any(|target| {
            truthy(target.get("version"))
                && model(context, target).is_none_or(|stored| !truthy(stored.get("head")))
        })
    {
        return Err(decline("a tagged component without a model head"));
    }
    Ok(())
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
        let identity = selected
            .first()
            .and_then(|target| target["identity"].as_str())
            .ok_or_else(|| decline("diff target identity"))?;
        let row: Value = engine.request(&json!({
            "kind":"versionDiff","root":root,"identity":identity,
            "fromVersion":from_version,"toVersion":to_version,
            "gitExecutable":"git","color":true,
        }))?;
        return Ok(json!({"comparisons":[row]}));
    }
    let request: Vec<Value> = capture.captured
        .iter()
        .map(|row| diff_target(row, from_version))
        .collect::<io::Result<_>>()?;
    engine.request(&json!({
        "kind": "workspaceDiff",
        "root": root,
        "targets": request,
        "gitExecutable": "git",
        "color": true,
        "modifiedOnly": pattern.is_none(),
    }))
}

/// `getConfig('git_path')` may be set: any mention in a config layer declines.
fn git_path_configured(root: &Path) -> bool {
    let files = [
        root.join("workspace.jsonc"),
        root.join(".bit").join("scope.json"),
        cache::cache_root().join("config").join("config.json"),
    ];
    env::var_os("BIT_CONFIG_GIT_PATH").is_some()
        || files
            .iter()
            .any(|file| fs::read_to_string(file).is_ok_and(|text| text.contains("git_path")))
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

/// The pattern's target: by directory first, then by id or name.
fn select(targets: &[Value], pattern: Option<&str>) -> io::Result<Vec<Value>> {
    let Some(pattern) = pattern else { return Ok(targets.to_vec()) };
    let allowed = |character: char| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || "_./-".contains(character)
    };
    if pattern.is_empty() || !pattern.chars().all(allowed) {
        return Err(decline("pattern outside the native grammar"));
    }
    let normalized = inventory::normalize(pattern);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let by_directory = matching(targets, |target| field(target, "directory") == directory);
    let selected = if by_directory.is_empty() {
        matching(targets, |target| {
            let identity = field(target, "identity");
            let name = identity
                .find('/')
                .map_or(identity, |slash| &identity[slash + 1..]);
            identity == pattern || name == pattern
        })
    } else {
        by_directory
    };
    if selected.len() != 1 {
        return Err(decline("the pattern does not select exactly one component"));
    }
    Ok(selected)
}

fn field<'v>(target: &'v Value, key: &str) -> &'v str {
    target
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn matching(targets: &[Value], keep: impl Fn(&Value) -> bool) -> Vec<Value> {
    targets
        .iter()
        .filter(|target| keep(target))
        .cloned()
        .collect()
}

/// A captured row as `workspaceDiff` takes it: without its peers, files in
/// the order the Node.js CLI's `globby` scan lists them.
fn diff_target(row: &Value, from_version: Option<&str>) -> io::Result<Value> {
    let mut row = row.clone();
    let object = row.as_object_mut().ok_or_else(|| decline("diff target"))?;
    object.remove("peerDependencies");
    if let Some(version) = from_version {
        object.insert("version".into(), json!(version));
    }
    let mut files: Vec<String> = array(object.get("files"), "files")?
        .iter()
        .map(|file| text(Some(file)).map(str::to_string))
        .collect::<io::Result<_>>()?;
    files.sort_by(|a, b| walk_order(a, b));
    object.insert("files".into(), json!(files));
    Ok(row)
}

/// `globby`'s order: directories breadth first, each directory's entries in
/// byte order, as libuv's `scandir` sorts them. A file's position is its
/// directory's depth, then its directory's path, then its name.
fn walk_order(left: &str, right: &str) -> std::cmp::Ordering {
    let split = |path: &str| -> (Vec<String>, String) {
        let mut parts: Vec<String> = path
            .split('/')
            .map(str::to_string)
            .collect();
        let name = parts.pop().unwrap_or_default();
        (parts, name)
    };
    let (left_dirs, left_name) = split(left);
    let (right_dirs, right_name) = split(right);
    left_dirs
        .len()
        .cmp(&right_dirs.len())
        .then_with(|| left_dirs.cmp(&right_dirs))
        .then_with(|| left_name.cmp(&right_name))
}

/// The comparisons to report: without a pattern, new components, then modified ones.
fn rows(result: &Value, all: bool) -> io::Result<Vec<&Value>> {
    let rows = array(result.get("comparisons"), "comparisons")?;
    if all {
        return Ok(rows.iter().collect());
    }
    let has_model = |row: &&Value| truthy(row.get("model"));
    let new = rows
        .iter()
        .filter(|row| !has_model(row));
    let modified = rows
        .iter()
        .filter(|row| has_model(row) && truthy(row.get("modified")));
    Ok(new.chain(modified).collect())
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
    let fields_diff = match row
        .get("model")
        .filter(|stored| truthy(Some(stored)))
    {
        None => None,
        Some(stored) => fields_diff(context, capture, target, stored, row, chalk, &versions)?,
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
    capture: &Capture,
    target: &Value,
    stored: &Value,
    row: &Value,
    chalk: Chalk,
    versions: &Versions<'_>,
) -> io::Result<Option<Vec<Value>>> {
    let identity = text(row.get("identity"))?;
    let component = capture.components
        .iter()
        .find(|item| item.identity.split('@').next() == Some(identity));
    let component = component.ok_or_else(|| decline("diff row without a captured component"))?;
    let side = metadata::Component {
        target,
        model: model(context, target),
        package_name: &component.package_name,
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

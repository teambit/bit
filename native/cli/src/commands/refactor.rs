//! Native `bit refactor` (`RefactorCmd` and `DependencyNameRefactorCmd` in `scopes/component/refactoring/refactor.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    inventory,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{
    config::WorkspaceConfig,
    model::{ComponentId, WorkspaceComponent},
    workspace::Workspace,
};
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

pub const COMMAND: Command = Command { name: "refactor", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
enum Action {
    DependencyName { old_id: String, new_id: String },
    Unrecognized(String),
}

enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

struct Prepared {
    report: String,
    writes: Vec<(PathBuf, Vec<u8>)>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(action) = parse_options(args) else {
        return Ok(Outcome::Declined("arguments outside the native `refactor` grammar".to_owned()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("refactor requires a workspace".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match action {
        Action::Unrecognized(sub) => run_unrecognized(&root, args, &sub, chalk),
        Action::DependencyName { old_id, new_id } => {
            run_dependency_name(&root, args, &old_id, &new_id)
        }
    }
}

fn parse_options(args: &[OsString]) -> Option<Action> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    if tokens
        .iter()
        .any(|token| token.starts_with('-'))
    {
        return None;
    }
    match tokens.as_slice() {
        ["dependency-name", old_id, new_id] if !old_id.is_empty() && !new_id.is_empty() => {
            Some(Action::DependencyName {
                old_id: (*old_id).to_owned(),
                new_id: (*new_id).to_owned(),
            })
        }
        [sub] if !sub.is_empty() && *sub != "dependency-name" => {
            Some(Action::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn run_unrecognized(
    root: &Path,
    args: &[OsString],
    sub: &str,
    chalk: Chalk,
) -> io::Result<Outcome> {
    if load_workspace(root).is_err() {
        return Ok(Outcome::Declined("invalid workspace configuration".to_owned()));
    }
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "refactor", please run "bit refactor --help" to list the subcommands"#,
    ));
    workspace_command::execute_then(root, args, "refactor", |_output| {
        Ok(Report { data, code: 0, details: None })
    })
}

fn run_dependency_name(
    root: &Path,
    args: &[OsString],
    old_id: &str,
    new_id: &str,
) -> io::Result<Outcome> {
    match prepare_dependency_name(root, old_id, new_id) {
        Ok(prepared) => workspace_command::execute_then(root, args, "dependency-name", |_output| {
            for (path, bytes) in &prepared.writes {
                fs::write(path, bytes)?;
            }
            Ok(Report { data: prepared.report, code: 0, details: None })
        }),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI refactor error stack".to_owned()));
            }
            workspace_command::execute_then(root, args, "dependency-name", |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("refactor: {reason}"))),
    }
}

fn load_workspace(root: &Path) -> Result<Workspace, Failure> {
    let config = WorkspaceConfig::load(root)?;
    if config.workspace.bitmap_auto_sync == Some(true)
        || config.workspace.default_scope.as_deref().is_none_or(str::is_empty)
    {
        return Err(Failure::Declined("unsupported workspace settings".to_owned()));
    }
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(|error| Failure::Declined(error.to_string()))?;
    Workspace::load(root, &config, &core).map_err(Failure::from)
}

fn prepare_dependency_name(root: &Path, old_id: &str, new_id: &str) -> Result<Prepared, Failure> {
    let ws = load_workspace(root)?;
    let old_pkg = resolve_package_name(root, &ws, old_id)?;
    let new_pkg = resolve_package_name(root, &ws, new_id)?;
    if old_pkg == new_pkg {
        return Err(Failure::User(format!(
            "refactoring: the old package-name and the new package-name are the same: {old_pkg}",
        )));
    }
    let mut changed_ids = Vec::new();
    let mut writes = Vec::new();
    for (_entry, comp) in ws.active() {
        if refactor_component(comp, &old_pkg, &new_pkg, &mut writes)? {
            changed_ids.push(format_component_id(&comp.id));
        }
    }
    let report = format!(
        "the following components have been changed ({old_pkg} => {new_pkg}):\n{}",
        changed_ids.join("\n"),
    );
    Ok(Prepared { report, writes })
}

fn format_component_id(id: &ComponentId) -> String {
    let base = id.to_string_without_version();
    match id.version.as_deref() {
        Some(ver) if !ver.is_empty() => format!("{base}@{ver}"),
        _ => base,
    }
}

fn resolve_package_name(root: &Path, ws: &Workspace, raw_id: &str) -> Result<String, Failure> {
    let normalized = inventory::normalize(raw_id);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    if let Some((_, comp)) = ws
        .active()
        .find(|(_, comp)| {
            (!comp.root_dir.is_empty() && comp.root_dir == directory)
                || format_component_id(&comp.id) == raw_id
                || comp.id.to_string_without_version() == raw_id
                || comp.id.name == raw_id
                || comp.package_name == raw_id
        })
    {
        return Ok(comp.package_name.clone());
    }
    if exists_in_scope_index(root, raw_id) {
        return Err(Failure::Declined("component exists only in local scope".to_owned()));
    }
    if is_valid_scoped_package_name(raw_id) {
        return Ok(raw_id.to_owned());
    }
    Err(Failure::User(format!(
        r#"refactoring: the id "{raw_id}" is neither a valid scoped-package-name nor an existing component-id"#,
    )))
}

fn is_valid_scoped_package_name(name: &str) -> bool {
    name.starts_with('@')
        && name.contains('/')
        && name.len() <= 214
        && !name.contains('\\')
        && !name.contains("..")
}

fn exists_in_scope_index(root: &Path, id: &str) -> bool {
    let Ok(bytes) = fs::read(workspace::scope_path(root).join("index.json")) else {
        return false;
    };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else {
        return false;
    };
    let without_version = id.split('@').next().unwrap_or(id);
    index["components"]
        .as_array()
        .is_some_and(|components| {
            components
                .iter()
                .any(|item| {
                    let name = item["id"]["name"].as_str().unwrap_or_default();
                    let scope = item["id"]["scope"].as_str().unwrap_or_default();
                    name == without_version || format!("{scope}/{name}") == without_version
                })
        })
}

fn refactor_component(
    comp: &WorkspaceComponent,
    old_pkg: &str,
    new_pkg: &str,
    writes: &mut Vec<(PathBuf, Vec<u8>)>,
) -> Result<bool, Failure> {
    let mut comp_changed = false;
    for rel_file in &comp.files {
        let path = comp.dir.join(rel_file);
        let bytes = fs::read(&path)?;
        if is_binary(&bytes) {
            continue;
        }
        let content = String::from_utf8_lossy(&bytes);
        let updated = replace_package_name(&content, old_pkg, new_pkg)?;
        if updated != content {
            writes.push((path, updated.into_bytes()));
            comp_changed = true;
        }
    }
    Ok(comp_changed)
}

fn is_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(512)];
    sample.contains(&0)
}

fn replace_package_name(input: &str, old_name: &str, new_name: &str) -> Result<String, Failure> {
    let mut current = input.to_owned();
    for quote in ['\'', '"'] {
        let pattern = format!("({quote}~?){old_name}(/|{quote})");
        let regex =
            regress::Regex::new(&pattern).map_err(|error| Failure::Declined(error.to_string()))?;
        let mut next = String::with_capacity(current.len());
        let mut last = 0;
        for mat in regex.find_iter(&current) {
            next.push_str(&current[last..mat.range.start]);
            if let Some(Some(prefix)) = mat.captures.first() {
                next.push_str(&current[prefix.clone()]);
            }
            next.push_str(new_name);
            if let Some(Some(suffix)) = mat.captures.get(1) {
                next.push_str(&current[suffix.clone()]);
            }
            last = mat.range.end;
        }
        next.push_str(&current[last..]);
        current = next;
    }
    Ok(current)
}

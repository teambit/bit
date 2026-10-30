//! Native `bit publish <component-pattern>` (`scopes/pkg/pkg/publish.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::workspace_default_scope,
    color::Chalk,
    scope_set::{Failure, selection},
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{
    dependencies::default_package_name,
    policy::scope::Scope,
    workspace::{Bitmap, BitmapEntry},
};
use bit_object_import::parse_jsonc;
use serde_json::json;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "publish", aliases: &[], run };

const NO_CANDIDATES_MSG: &str = "no component candidates found to publish";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub dry_run: bool,
    pub allow_staged: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("publish arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native publish grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI publish delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&options);
    };
    if is_empty_workspace(&root).unwrap_or(false) {
        let is_json = options.json;
        return workspace_command::execute_without_loader(&root, args, "publish", move |_| {
            Ok(Report {
                data: if is_json { "[]".to_owned() } else { NO_CANDIDATES_MSG.to_owned() },
                code: 0,
                details: None,
            })
        });
    }
    execute_workspace_publish(&root, args, &options)
}

fn run_outside_workspace(options: &Options) -> io::Result<Outcome> {
    let text = if options.json { "[]" } else { NO_CANDIDATES_MSG };
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{text}")?;
    stdout.flush()?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn execute_workspace_publish(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    let ws_val = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    let default_scope = workspace_default_scope(&ws_val).ok();
    let bitmap = Bitmap::load(root, default_scope.as_deref())?;
    let matched = match selection::resolve_pattern_entries(
        root,
        &bitmap,
        &options.pattern,
        Chalk::detect(args),
    ) {
        Ok(matched) => matched,
        Err(Failure::User(err)) if !options.dry_run => {
            return super::lint_cmd::emit_pattern_error(root, args, "publish", options.json, err);
        }
        Err(_) => Vec::new(),
    };
    if matched.is_empty() {
        return empty_candidates_outcome(root, args, options.json);
    }
    if let Some(outcome) = check_unexported_error(root, args, options, &matched)? {
        return Ok(outcome);
    }
    if options.dry_run {
        let data = format_dry_run_report(&matched, options.json);
        return workspace_command::execute_without_loader(root, args, "publish", move |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("publish execution delegated".into()))
}

fn empty_candidates_outcome(root: &Path, args: &[OsString], is_json: bool) -> io::Result<Outcome> {
    workspace_command::execute_without_loader(root, args, "publish", move |_| {
        Ok(Report {
            data: if is_json { "[]".to_owned() } else { NO_CANDIDATES_MSG.to_owned() },
            code: 0,
            details: None,
        })
    })
}

fn check_unexported_error(
    root: &Path,
    args: &[OsString],
    options: &Options,
    matched: &[&BitmapEntry],
) -> io::Result<Option<Outcome>> {
    if options.dry_run {
        return Ok(None);
    }
    if !options.allow_staged {
        let unexported = collect_unexported_ids(root, matched);
        if !unexported.is_empty() {
            let msg = format!(
                "unable to publish the following component(s), please make sure they are exported: {}",
                unexported.join(", "),
            );
            return super::lint_cmd::emit_pattern_error(root, args, "publish", options.json, msg)
                .map(Some);
        }
    }
    let untagged = collect_untagged_ids(root, matched);
    if !untagged.is_empty() {
        let msg = format!(
            "unable to publish the following component(s), please make sure they are tagged: {}",
            untagged.join(", "),
        );
        return super::lint_cmd::emit_pattern_error(root, args, "publish", options.json, msg)
            .map(Some);
    }
    Ok(None)
}

pub(super) fn collect_unexported_ids(root: &Path, entries: &[&BitmapEntry]) -> Vec<String> {
    let scope = Scope::find(root);
    entries
        .iter()
        .filter(|entry| !is_entry_exported(scope.as_ref(), entry))
        .map(|entry| selection::entry_full_id(entry))
        .collect()
}

pub(super) fn collect_untagged_ids(root: &Path, entries: &[&BitmapEntry]) -> Vec<String> {
    let scope = Scope::find(root);
    entries
        .iter()
        .filter(|entry| !is_entry_in_scope(scope.as_ref(), entry))
        .map(|entry| selection::entry_full_id(entry))
        .collect()
}

fn is_entry_in_scope(scope: Option<&Scope>, entry: &BitmapEntry) -> bool {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return false;
    };
    scope
        .and_then(|sc| {
            sc.model(&entry.id.to_string_without_version())
                .ok()
                .flatten()
        })
        .is_some_and(|model| model["versions"].get(ver).is_some())
}

fn is_entry_exported(scope: Option<&Scope>, entry: &BitmapEntry) -> bool {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return false;
    };
    let Some(scope_ref) = scope else {
        return false;
    };
    let Some(model) = scope_ref
        .model(&entry.id.to_string_without_version())
        .ok()
        .flatten()
    else {
        return false;
    };
    model["scope"]
        .as_str()
        .is_some_and(|sc| !sc.is_empty())
        && model["versions"].get(ver).is_some()
        && model["remotes"]
            .as_array()
            .is_some_and(|remotes| !remotes.is_empty())
}

fn format_dry_run_report(entries: &[&BitmapEntry], is_json: bool) -> String {
    if is_json {
        let items: Vec<_> = entries
            .iter()
            .map(|entry| {
                let pkg = default_package_name(&entry.id);
                let ver = entry.id.version.as_deref().unwrap_or("0.0.1");
                json!({
                    "id": selection::entry_full_id(entry),
                    "data": format!("{pkg}@{ver}"),
                })
            })
            .collect();
        return serde_json::to_string_pretty(&items).unwrap_or_else(|_| "[]".to_owned());
    }
    entries
        .iter()
        .map(|entry| {
            let pkg = default_package_name(&entry.id);
            let ver = entry.id.version.as_deref().unwrap_or("0.0.1");
            format!("publishing {pkg}@{ver} (dry-run)")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn is_empty_workspace(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut dry_run = false;
    let mut allow_staged = false;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-d" | "--dry-run" => dry_run = true,
            "--allow-staged" => allow_staged = true,
            "-j" | "--json" => json = true,
            val if !val.starts_with('-') && !val.is_empty() && pattern.is_none() => {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, dry_run, allow_staged, json })
}

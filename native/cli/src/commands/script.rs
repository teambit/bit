//! Native `bit script [script-name]` (`scopes/workspace/scripts/script.cmd.ts`).

pub(in crate::commands) use self::{
    parser::{ScriptHandler, parse_env_scripts_in_dir},
    runner::{find_workspace_env_component, resolve_workspace_components},
};

mod parser;
mod runner;
#[cfg(test)]
mod tests;

use self::runner::{ScriptFailure, execute, read_allowed_envs};
use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "script", aliases: &[], run };

const MISSING_SCRIPT_ERR: &str = "script name is required. Use --list to see available scripts.";
const NO_ENVS_CONFIG_MSG: &str = "no envs configured. Add to workspace.jsonc:\n{\n  \"teambit.workspace/scripts\": {\n    \"envs\": [\"your-scope/your-env\"]\n  }\n}";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub script_name: Option<String>,
    pub list: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("script arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native script grammar".into()));
    };
    if !options.list
        && options.script_name.is_none()
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return missing_script_outcome(args);
    }
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&cwd, args, chalk);
    };
    if let Ok(Some(msg)) = fast_workspace_message(&root, chalk) {
        return workspace_command::execute_without_loader(&root, args, "script", |_| {
            Ok(Report { data: msg, code: 0, details: None })
        });
    }
    finish_script_outcome(&root, args, execute(&root, &options, chalk))
}

fn run_outside_workspace(cwd: &Path, args: &[OsString], chalk: Chalk) -> io::Result<Outcome> {
    if let Some(scope) = scope_root::discover().ok().flatten() {
        if scope.bare && bare_scope_has_no_envs(&scope.path) {
            let msg = chalk.yellow(NO_ENVS_CONFIG_MSG);
            return workspace_command::execute_without_loader_scope(
                &scope.path,
                args,
                "script",
                |_| Ok(Report { data: msg, code: 0, details: None }),
            );
        }
        return Ok(Outcome::Declined("script requires a workspace".into()));
    }
    let msg = chalk.yellow(NO_ENVS_CONFIG_MSG);
    workspace_command::execute_without_loader_scope(cwd, args, "script", |_| {
        Ok(Report { data: msg, code: 0, details: None })
    })
}

fn bare_scope_has_no_envs(scope_path: &Path) -> bool {
    let Ok(bytes) = fs::read(scope_path.join("scope.json")) else {
        return false;
    };
    let Ok(parsed) = parse_jsonc(&bytes) else {
        return false;
    };
    read_allowed_envs(&parsed["config"]).is_empty()
}

fn missing_script_outcome(args: &[OsString]) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        return workspace_command::execute_without_loader(&root, args, "script", |_| {
            Err(io::Error::other(MISSING_SCRIPT_ERR))
        });
    }
    workspace_command::execute_without_loader_scope(&cwd, args, "script", |_| {
        Err(io::Error::other(MISSING_SCRIPT_ERR))
    })
}

fn finish_script_outcome(
    root: &Path,
    args: &[OsString],
    result: Result<String, ScriptFailure>,
) -> io::Result<Outcome> {
    match result {
        Ok(data) => workspace_command::execute_without_loader(root, args, "script", |_| {
            Ok(Report { data, code: 0, details: None })
        }),
        Err(ScriptFailure::User(message)) => {
            if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
                return Ok(Outcome::Declined("CI script error stack".into()));
            }
            workspace_command::execute_without_loader(root, args, "script", |_| {
                Err(io::Error::other(message))
            })
        }
        Err(ScriptFailure::Declined(reason)) => Ok(Outcome::Declined(format!("script: {reason}"))),
    }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut script_name = None;
    let mut list = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                super::internalize::consume_trailing_internalize(iter, &mut script_name)?;
                break;
            }
            "--no-color" => {}
            "-l" | "--list" | "--list=true" => list = true,
            "--list=false" => list = false,
            val if !val.starts_with('-') && !val.is_empty() && script_name.is_none() => {
                script_name = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { script_name, list })
}

pub(super) fn fast_workspace_message(root: &Path, chalk: Chalk) -> io::Result<Option<String>> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if super::build_cmd::is_bitmap_auto_sync(&ws_config) {
        return Ok(None);
    }
    if read_allowed_envs(&ws_config).is_empty() {
        return Ok(Some(chalk.yellow(NO_ENVS_CONFIG_MSG)));
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    if active_component_count(&bitmap) == 0 {
        return Ok(Some(chalk.yellow("no components found")));
    }
    Ok(None)
}

pub(super) fn active_component_count(bitmap: &Value) -> usize {
    bitmap
        .as_object()
        .map_or(0, |rows| {
            rows.iter()
                .filter(|(key, row)| {
                    !key.starts_with('$')
                        && *key != "_bit_lane"
                        && row.is_object()
                        && row["isAvailableOnCurrentLane"] != false
                        && row["config"]["teambit.component/remove"]["removed"] != true
                })
                .count()
        })
}

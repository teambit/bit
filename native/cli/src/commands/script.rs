//! Native `bit script [script-name]` (`scopes/workspace/scripts/script.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
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
        let cwd = env::current_dir()?;
        if let Some(root) = workspace::root(&cwd) {
            return workspace_command::execute_without_loader(&root, args, "script", |_| {
                Err(io::Error::other(MISSING_SCRIPT_ERR))
            });
        }
        return workspace_command::execute_without_loader_scope(&cwd, args, "script", |_| {
            Err(io::Error::other(MISSING_SCRIPT_ERR))
        });
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Outcome::Declined("script requires a workspace".into()));
    };
    let chalk = Chalk::detect(args);
    if let Ok(Some(msg)) = fast_workspace_message(&root, chalk) {
        return workspace_command::execute_without_loader(&root, args, "script", |_| {
            Ok(Report { data: msg, code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("script execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut script_name = None;
    let mut list = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-l" | "--list" => list = true,
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
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(None);
    }
    let has_envs = ws_config["teambit.workspace/scripts"]["envs"]
        .as_array()
        .is_some_and(|envs| !envs.is_empty());
    if !has_envs {
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

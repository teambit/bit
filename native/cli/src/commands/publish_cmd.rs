//! Native `bit publish <component-pattern>` (`scopes/pkg/pkg/publish.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

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
        return Ok(Outcome::Declined("publish outside workspace delegated".into()));
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
    Ok(Outcome::Declined("publish execution delegated".into()))
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

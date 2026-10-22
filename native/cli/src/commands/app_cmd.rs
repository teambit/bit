//! Native `bit app [subcommand]` (`scopes/harmony/application/app.cmd.ts`, alias `apps`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "app", aliases: &["apps"], run };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("app arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native app grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI app delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Outcome::Declined("app outside workspace delegated".into()));
    };
    if is_empty_app_workspace(&root).unwrap_or(false) {
        let chalk = Chalk::detect(args);
        let is_json = options.json;
        return workspace_command::execute_without_loader(&root, args, "app", move |_| {
            let data = if is_json { "[]".to_owned() } else { chalk.yellow("no apps found") };
            Ok(Report { data, code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("app list delegated".into()))
}

pub(super) fn is_empty_app_workspace(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let has_custom_root_aspects = ws_config
        .as_object()
        .is_some_and(|obj| {
            obj.keys()
                .any(|key| !key.starts_with('$') && !key.starts_with("teambit."))
        });
    if has_custom_root_aspects {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut json = false;
    let mut saw_list = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" => json = true,
            "list" if !saw_list => saw_list = true,
            _ => return None,
        }
    }
    Some(Options { json })
}

//! Native `bit compile [component-names...]` (`scopes/compilation/compiler/compiler.cmd.ts`).

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

pub const COMMAND: Command = Command { name: "compile", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub components: Vec<String>,
    pub changed: bool,
    pub verbose: bool,
    pub json: bool,
    pub delete_dist_dir: bool,
    pub generate_types: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("compile arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native compile grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI compile delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_without_loader_scope(&cwd, args, "compile", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    if options.json && options.components.is_empty() && is_empty_workspace(&root).unwrap_or(false) {
        return workspace_command::execute_without_loader(&root, args, "compile", |_| {
            Ok(Report { data: "[]".into(), code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("compile execution delegated".into()))
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
    let mut options = Options::default();
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-c" | "--changed" => options.changed = true,
            "-v" | "--verbose" => options.verbose = true,
            "-j" | "--json" => options.json = true,
            "-d" | "--delete-dist-dir" => options.delete_dist_dir = true,
            "--generate-types" => options.generate_types = true,
            val if !val.starts_with('-') && !val.is_empty() => {
                options.components.push(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

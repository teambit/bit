//! Native `bit update [package-patterns...]` (`scopes/workspace/install/update.cmd.tsx`, alias `up`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "update", aliases: &["up"], run };

const NO_DEPS_FOUND_MSG: &str = "No dependencies found that match the patterns";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub patterns: Vec<String>,
    pub yes: bool,
    pub patch: bool,
    pub minor: bool,
    pub major: bool,
    pub semver: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("update arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native update grammar".into()));
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI update delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Outcome::Declined("update outside workspace delegated".into()));
    };
    if has_no_workspace_dependencies(&root).unwrap_or(false) {
        return workspace_command::execute_then(&root, args, "update", |output| {
            output.failure(NO_DEPS_FOUND_MSG);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("update execution delegated".into()))
}

pub(super) fn has_no_workspace_dependencies(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let policy = &ws_config["teambit.dependencies/dependency-resolver"]["policy"];
    if non_empty_object(&policy["dependencies"]) || non_empty_object(&policy["peerDependencies"]) {
        return Ok(false);
    }
    if non_empty_object(&ws_config["teambit.workspace/variants"]) {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

fn non_empty_object(val: &Value) -> bool {
    val.as_object()
        .is_some_and(|obj| !obj.is_empty())
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-y" | "--yes" => options.yes = true,
            "--patch" => options.patch = true,
            "--minor" => options.minor = true,
            "--major" => options.major = true,
            "--semver" => options.semver = true,
            val if !val.starts_with('-') && !val.is_empty() => {
                options.patterns.push(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

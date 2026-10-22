//! Native `bit show <component-name>` (`scopes/component/component/show/show.cmd.ts`).

mod deps;
mod deps_policy;
mod render;
#[cfg(test)]
mod tests;
mod workspace_show;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "show", aliases: &[], run };

const REMOTE_NO_HOST_ERR: &str = "error: the current directory is not a workspace nor a scope. the full \"bit show\" is not supported.\nto see the legacy bit show, please use \"--legacy\" flag";
const LOCAL_NO_HOST_ERR: &str = "Could not find a workspace or scope. Consider using --remote or run inside a valid workspace or scope.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: String,
    pub json: bool,
    pub legacy: bool,
    pub remote: bool,
    pub browser: bool,
    pub compare: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("show arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native show grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI show delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(err) = missing_host_error(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "show", |_| {
            Err(io::Error::other(err))
        });
    }
    if let Some(outcome) = workspace_show::try_run(&cwd, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("show execution delegated".into()))
}

pub(super) fn missing_host_error(cwd: &Path, options: &Options) -> Option<&'static str> {
    if options.legacy
        || workspace::root(cwd).is_some()
        || cwd.join("scope.json").is_file()
        || cwd.join(".bit").is_dir()
    {
        return None;
    }
    if options.remote { Some(REMOTE_NO_HOST_ERR) } else { Some(LOCAL_NO_HOST_ERR) }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut id = None;
    let mut json = false;
    let mut legacy = false;
    let mut remote = false;
    let mut browser = false;
    let mut compare = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" => json = true,
            "-l" | "--legacy" => legacy = true,
            "-r" | "--remote" => remote = true,
            "-b" | "--browser" => browser = true,
            "-c" | "--compare" => compare = true,
            val if !val.starts_with('-') && !val.is_empty() && id.is_none() => {
                id = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { id: id?, json, legacy, remote, browser, compare })
}

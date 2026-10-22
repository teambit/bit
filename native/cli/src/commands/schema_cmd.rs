//! Native `bit schema <pattern>` (`scopes/semantics/schema/schema.cmd.ts`, alias `api`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "schema", aliases: &["api"], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub remote: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("schema arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native schema grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI schema delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_missing_host(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "schema", |_| {
            Err(io::Error::other(HOST_NOT_FOUND_ERR))
        });
    }
    Ok(Outcome::Declined("schema extraction delegated".into()))
}

pub(super) fn is_missing_host(cwd: &Path, options: &Options) -> bool {
    !options.remote
        && workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut remote = false;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-r" | "--remote" => remote = true,
            "-j" | "--json" => json = true,
            val if !val.starts_with('-') && !val.is_empty() && pattern.is_none() => {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, remote, json })
}

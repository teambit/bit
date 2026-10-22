//! Native `bit format [component-pattern]` (`scopes/defender/formatter/format.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "format", aliases: &[], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub changed: bool,
    pub check: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("format arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native format grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI format delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_missing_host(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "format", |_| {
            Err(io::Error::other(HOST_NOT_FOUND_ERR))
        });
    }
    Ok(Outcome::Declined("format execution delegated".into()))
}

pub(super) fn is_missing_host(cwd: &Path, options: &Options) -> bool {
    options.pattern.is_none()
        && !options.changed
        && workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-c" | "--changed" => options.changed = true,
            "--check" => options.check = true,
            "-j" | "--json" => options.json = true,
            val if !val.starts_with('-') && !val.is_empty() && options.pattern.is_none() => {
                options.pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

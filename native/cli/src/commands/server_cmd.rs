//! Native `bit server` (`scopes/harmony/bit/server-cmd.ts`).
//!
//! Validates [`Options`] workspace preconditions for [`COMMAND`] (`bit server`) before delegating or reporting into [`Outcome`].

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "server", aliases: &[], run };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub port: Option<u16>,
    pub compile: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("server arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native server grammar".into()));
    }
    if !env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && !["0", "false", "no", "off"]
                    .iter()
                    .any(|falsy| trimmed.eq_ignore_ascii_case(falsy))
        })
    {
        let cwd = env::current_dir()?;
        if workspace::root(&cwd).is_none() {
            let msg = format!(
                "unable to run bit-server, the current directory {} is not a workspace",
                cwd.display(),
            );
            return workspace_command::execute_failure_scope(
                &cwd,
                args,
                "server",
                false,
                "",
                io::Error::other(msg),
            );
        }
    }
    Ok(Outcome::Declined("server execution delegated".into()))
}

#[inline]
fn parse_nonzero_port(raw: &str) -> Option<u16> {
    raw.trim()
        .parse::<u16>()
        .ok()
        .filter(|&port| port >= 1)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--" => return (idx + 1 == args.len()).then_some(options),
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-c" | "--compile" | "--compile=true" => options.compile = true,
            "--compile=false" | "--no-compile" => options.compile = false,
            "-p" | "--port" => {
                if let Some(&next) = args.get(idx + 1)
                    && !next.starts_with('-')
                {
                    options.port = Some(parse_nonzero_port(next)?);
                    idx += 1;
                }
            }
            val if let Some(port) = val
                .strip_prefix("--port=")
                .or_else(|| val.strip_prefix("-p=")) =>
            {
                options.port = Some(parse_nonzero_port(port)?);
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(options)
}

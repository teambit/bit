//! Native `bit server` (`scopes/harmony/bit/server-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use std::{ffi::OsString, io};

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
    Ok(Outcome::Declined("server execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--no-color" => {}
            "-c" | "--compile" => options.compile = true,
            "-p" | "--port" => {
                if let Some(&next) = args.get(idx + 1)
                    && !next.starts_with('-')
                {
                    options.port = Some(next.parse::<u16>().ok()?);
                    idx += 1;
                }
            }
            val if val.starts_with("--port=") => {
                options.port = Some(val["--port=".len()..].parse::<u16>().ok()?);
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(options)
}

//! Native `bit completion` (`scopes/harmony/cli/completion.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "completion", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("completion arguments are not UTF-8".into()));
    };
    if !valid_options(&argv[1..]) {
        return Ok(Outcome::Declined("outside native completion grammar".into()));
    }
    Ok(Outcome::Declined("completion script generation delegated".into()))
}

pub(super) fn valid_options(args: &[&str]) -> bool {
    args.iter()
        .all(|&arg| arg == "--no-color")
}

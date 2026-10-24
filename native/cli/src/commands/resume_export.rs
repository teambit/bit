//! Native `bit resume-export <export-id> <remotes...>` (`scopes/scope/export/resume-export.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "resume-export", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub export_id: String,
    pub remotes: Vec<String>,
    pub delete: bool,
    pub force: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("resume-export arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native resume-export grammar".into()));
    }
    Ok(Outcome::Declined("resume-export execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut export_id = None;
    let mut remotes = Vec::new();
    let mut delete = false;
    let mut force = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-d" | "--delete" => delete = true,
            "-f" | "--force" => force = true,
            val if !val.starts_with('-') && !val.is_empty() => {
                if export_id.is_none() {
                    export_id = Some(val.to_owned());
                } else {
                    remotes.push(val.to_owned());
                }
            }
            _ => return None,
        }
    }
    (!remotes.is_empty()).then_some(())?;
    Some(Options { export_id: export_id?, remotes, delete, force })
}

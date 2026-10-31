//! Native `bit resume-export <export-id> <remotes...>` (`scopes/scope/export/resume-export.cmd.ts`).

mod deletion;
mod deletion_report;
mod execute;
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
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native resume-export grammar".into()));
    };
    execute::run(args, &options)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut export_id = None;
    let mut remotes = Vec::new();
    let mut delete = false;
    let mut force = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_resume_args(iter, &mut export_id, &mut remotes)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "--delete" | "--delete=true" => delete = true,
            "--delete=false" => delete = false,
            "--force" | "--force=true" => force = true,
            "--force=false" => force = false,
            val if !val.starts_with('-') && !val.trim().is_empty() => {
                push_resume_arg(val.trim(), &mut export_id, &mut remotes);
            }
            _ => return None,
        }
    }
    (!remotes.is_empty()).then_some(())?;
    Some(Options { export_id: export_id?, remotes, delete, force })
}

fn consume_trailing_resume_args<'a>(
    iter: impl Iterator<Item = &'a str>,
    export_id: &mut Option<String>,
    remotes: &mut Vec<String>,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            return None;
        }
        push_resume_arg(trimmed, export_id, remotes);
    }
    Some(())
}

fn push_resume_arg(val: &str, export_id: &mut Option<String>, remotes: &mut Vec<String>) {
    if export_id.is_none() {
        *export_id = Some(val.to_owned());
    } else if !remotes
        .iter()
        .any(|existing| existing == val)
    {
        remotes.push(val.to_owned());
    }
}

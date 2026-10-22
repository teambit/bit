//! Native `bit run-action <action-name> <remote> <options>` (`scopes/scope/actions/run-action.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use serde_json::Value;
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "run-action", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub action_name: String,
    pub remote: String,
    pub payload: Value,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("run-action arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native run-action grammar".into()));
    }
    Ok(Outcome::Declined("run-action execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut positional = Vec::new();
    for &arg in args {
        match arg {
            "--no-color" => {}
            val if !val.starts_with('-') && !val.is_empty() && positional.len() < 3 => {
                positional.push(val);
            }
            _ => return None,
        }
    }
    if positional.len() != 3 {
        return None;
    }
    let payload = serde_json::from_str::<Value>(positional[2]).ok()?;
    Some(Options {
        action_name: positional[0].to_owned(),
        remote: positional[1].to_owned(),
        payload,
    })
}

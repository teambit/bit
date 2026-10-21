//! Native `bit ripple <sub-command>` (`scopes/cloud/ripple/ripple.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "ripple", aliases: &[], run };

const BARE_RIPPLE_MSG: &str =
    "[ripple] please specify a subcommand. See --help for available commands.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Bare,
    ListInvalidLimit { raw: String, json: bool },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ripple arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("ripple remote subcommand delegated".into()));
    };
    let cwd = env::current_dir()?;
    let root_opt = workspace::root(&cwd);
    match subcommand {
        Subcommand::Bare => run_bare(&cwd, root_opt.as_deref(), args),
        Subcommand::ListInvalidLimit { raw, json } => {
            emit_invalid_limit(&cwd, root_opt.as_deref(), args, &raw, json)
        }
    }
}

fn run_bare(cwd: &Path, root_opt: Option<&Path>, args: &[OsString]) -> io::Result<Outcome> {
    let report = Report { data: BARE_RIPPLE_MSG.into(), code: 1, details: None };
    if let Some(root) = root_opt {
        workspace_command::execute_then(root, args, "ripple", |_| Ok(report))
    } else {
        workspace_command::execute_with_scope(cwd, args, "ripple", &report)
    }
}

fn emit_invalid_limit(
    cwd: &Path,
    root_opt: Option<&Path>,
    args: &[OsString],
    raw: &str,
    json_flag: bool,
) -> io::Result<Outcome> {
    if json_flag || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI/json ripple error delegated".into()));
    }
    let msg = format!(r#"invalid --limit value "{raw}": expected a positive integer"#);
    let err = io::Error::other(msg);
    if let Some(root) = root_opt {
        workspace_command::execute_then(root, args, "list", |_| Err(err))
    } else {
        workspace_command::execute_failure_scope(cwd, args, "list", false, "", err)
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        [] => Some(Subcommand::Bare),
        ["list", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_list_invalid_limit(rest)
        }
        _ => None,
    }
}

fn parse_list_invalid_limit(rest: &[&str]) -> Option<Subcommand> {
    let mut limit = None;
    let mut json = false;
    let mut idx = 0;
    while idx < rest.len() {
        match rest[idx] {
            "-j" | "--json" => json = true,
            "-l" | "--limit" => {
                idx += 1;
                limit = Some((*rest.get(idx)?).to_owned());
            }
            arg if arg.starts_with("--limit=") => {
                limit = Some(arg["--limit=".len()..].to_owned());
            }
            _ => {}
        }
        idx += 1;
    }
    let raw = limit?;
    if parse_positive_int(&raw).is_some() {
        return None;
    }
    Some(Subcommand::ListInvalidLimit { raw, json })
}

pub(super) fn parse_positive_int(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let val = trimmed.parse::<u64>().ok()?;
    (val >= 1).then_some(val)
}

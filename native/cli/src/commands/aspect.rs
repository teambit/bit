//! Native `bit aspect <list-core|set|unset>` (`scopes/harmony/aspect/aspect.cmd.ts`).

pub(in crate::commands) use self::mutation::{
    deep_merge, find_bitmap_row_mut, find_bitmap_row_ref, serialize_json_preserving_newline,
    workspace_default_scope, write_bitmap_if_changed,
};

mod mutation;
#[cfg(test)]
mod tests;

use self::mutation::prepare;
use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    scope_set::Failure,
    workspace_command::{self, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "aspect", aliases: &[], run };

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    ListCore { json: bool },
    Set { pattern: String, aspect_id: String, config: Value, merge: bool },
    Unset { pattern: String, aspect_id: String },
    Unrecognized(String),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("aspect arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native aspect grammar".into()));
    };
    if let Subcommand::ListCore { json: json_flag } = subcommand {
        return run_list_core(args, json_flag);
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("aspect requires a workspace".into()));
    };
    let chalk = Chalk::detect(args);
    let label = subcommand.loader_label();
    match prepare(&root, &subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI aspect error stack".into()));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("aspect: {reason}"))),
    }
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::ListCore { .. } => "list-core",
            Self::Set { .. } => "set",
            Self::Unset { .. } => "unset",
            Self::Unrecognized(_) => "aspect",
        }
    }
}

fn run_list_core(args: &[OsString], json_flag: bool) -> io::Result<Outcome> {
    let ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).map_err(io::Error::other)?;
    let root_opt = scope_root::discover().ok().flatten();
    if json_flag {
        let history = root_opt
            .as_ref()
            .filter(|root| !root.bare)
            .map(|root| History::start(&root.path, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&ids)?.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let data = ids.join("\n");
    let report = Report { data, code: 0, details: None };
    match root_opt {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "list-core", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "list-core", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["list-core", rest @ ..] => {
            let mut json = false;
            for &arg in rest {
                match arg {
                    "-j" | "--json" => json = true,
                    _ => return None,
                }
            }
            Some(Subcommand::ListCore { json })
        }
        ["set", rest @ ..] => parse_set(rest),
        ["unset", pattern, aspect_id]
            if is_supported_pattern(pattern)
                && !aspect_id.is_empty()
                && !aspect_id.starts_with('-') =>
        {
            Some(Subcommand::Unset {
                pattern: (*pattern).to_owned(),
                aspect_id: (*aspect_id).to_owned(),
            })
        }
        [sub]
            if !sub.starts_with('-')
                && !matches!(*sub, "list" | "list-core" | "get" | "set" | "unset" | "update") =>
        {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_set(rest: &[&str]) -> Option<Subcommand> {
    let mut merge = false;
    let mut positional = Vec::new();
    for &arg in rest {
        match arg {
            "-m" | "--merge" => merge = true,
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
        }
    }
    let (pattern, aspect_id, config) = match positional.as_slice() {
        [pattern, aspect_id] => (*pattern, *aspect_id, json!({})),
        [pattern, aspect_id, raw_cfg] => {
            let parsed: Value = serde_json::from_str(raw_cfg).ok()?;
            if !parsed.is_object() {
                return None;
            }
            (*pattern, *aspect_id, parsed)
        }
        _ => return None,
    };
    if !is_supported_pattern(pattern) || aspect_id.is_empty() {
        return None;
    }
    Some(Subcommand::Set {
        pattern: pattern.to_owned(),
        aspect_id: aspect_id.to_owned(),
        config,
        merge,
    })
}

pub(in crate::commands) fn is_supported_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.starts_with('-')
        && !pattern.contains(['$', ':', '@'])
        && !pattern.contains(" AND ")
        && !pattern.starts_with("teambit.")
}

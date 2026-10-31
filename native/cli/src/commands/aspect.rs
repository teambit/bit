//! Native `bit aspect <list|list-core|get|set|unset|update>` (`scopes/harmony/aspect/aspect.cmd.ts`).

pub(in crate::commands) use self::mutation::{
    CompJsonEdit, deep_merge, find_bitmap_row_mut, find_bitmap_row_ref, find_component_aspect,
    find_matching_aspect_key, resolve_aspect_identity, resolve_latest_aspect_version,
    serialize_json_preserving_newline, update_in_bitmap_row, update_in_comp_json,
    workspace_default_scope, write_bitmap_if_changed,
};

mod inspect;
mod mutation;
#[cfg(test)]
mod tests;

use self::{
    inspect::{get::run_get, run_list},
    mutation::prepare,
};
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
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "aspect", aliases: &[], run };

pub(super) const CORE_ASPECT_IDS: &str =
    include_str!("../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ListOpts {
    pub pattern: Option<String>,
    pub debug: bool,
    pub json: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GetOpts {
    pub component: String,
    pub aspect_id: Option<String>,
    pub debug: bool,
    pub json: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    List(ListOpts),
    ListCore { json: bool },
    Get(GetOpts),
    Set { pattern: String, aspect_id: String, config: Value, merge: bool },
    Unset { pattern: String, aspect_id: String },
    Update { aspect_id: String, pattern: Option<String> },
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
    let chalk = Chalk::detect(args);
    if let Subcommand::Unrecognized(sub) = &subcommand {
        return run_unrecognized(args, sub, chalk);
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&cwd, args, &subcommand);
    };
    match &subcommand {
        Subcommand::List(opts) => {
            return finish_outcome(&root, args, "list", run_list(&root, args, opts, chalk));
        }
        Subcommand::Get(opts) => {
            return finish_outcome(&root, args, "get", run_get(&root, args, opts, chalk));
        }
        Subcommand::ListCore { .. }
        | Subcommand::Set { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Update { .. }
        | Subcommand::Unrecognized(_) => {}
    }
    let label = subcommand.loader_label();
    let result = prepare(&root, &subcommand, chalk)
        .and_then(|prepared| {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
                .map_err(|err| Failure::Declined(err.to_string()))
        });
    finish_outcome(&root, args, label, result)
}

fn run_outside_workspace(
    cwd: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI aspect outside workspace delegated".into()));
    }
    let (json, prop) = match subcommand {
        Subcommand::List(opts) if opts.pattern.is_none() => (opts.json, "listIds"),
        Subcommand::List(opts) => (opts.json, "idsByPattern"),
        Subcommand::Get(opts) => (opts.json, "resolveComponentId"),
        Subcommand::Set { .. } | Subcommand::Unset { .. } => (false, "idsByPattern"),
        Subcommand::Update { .. } => (false, "resolveComponentId"),
        Subcommand::ListCore { .. } | Subcommand::Unrecognized(_) => {
            return Ok(Outcome::Declined("aspect requires a workspace".into()));
        }
    };
    let msg = format!("Cannot read properties of undefined (reading '{prop}')");
    workspace_command::execute_failure_scope(
        cwd,
        args,
        subcommand.loader_label(),
        json,
        "",
        io::Error::other(msg),
    )
}

fn finish_outcome(
    root: &Path,
    args: &[OsString],
    label: &str,
    result: Result<Outcome, Failure>,
) -> io::Result<Outcome> {
    match result {
        Ok(outcome) => Ok(outcome),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI aspect error stack".into()));
            }
            workspace_command::execute_then(root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("aspect: {reason}"))),
    }
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::List(_) => "list",
            Self::ListCore { .. } => "list-core",
            Self::Get(_) => "get",
            Self::Set { .. } => "set",
            Self::Unset { .. } => "unset",
            Self::Update { .. } => "update",
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

fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "aspect", please run "bit aspect --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "aspect", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "aspect", &report),
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
        .filter(|arg| !matches!(*arg, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["list", rest @ ..] => parse_list(rest),
        ["list-core", rest @ ..] => parse_list_core(rest),
        ["get", rest @ ..] => parse_get(rest),
        ["set", rest @ ..] => parse_set(rest),
        ["unset", rest @ ..] => parse_unset(rest),
        ["update", rest @ ..] => parse_update(rest),
        other => {
            let tokens = super::scope_set::collect_non_flag_tokens(other)?;
            let [sub] = tokens.as_slice() else { return None };
            (!matches!(*sub, "list" | "list-core" | "get" | "set" | "unset" | "update")).then(
                || Subcommand::Unrecognized((*sub).to_owned()),
            )
        }
    }
}

fn parse_unset(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    let [pattern, aspect_id] = tokens.as_slice() else { return None };
    (is_supported_pattern(pattern) && !aspect_id.is_empty()).then(|| Subcommand::Unset {
        pattern: (*pattern).to_owned(),
        aspect_id: (*aspect_id).to_owned(),
    })
}

fn consume_trailing<'a>(iter: impl Iterator<Item = &'a str>, out: &mut Vec<&'a str>) -> Option<()> {
    for trailing in iter {
        (!trailing.is_empty() && !trailing.starts_with('-')).then_some(())?;
        out.push(trailing);
    }
    Some(())
}

fn parse_debug_json_args<'a>(rest: &[&'a str]) -> Option<(Vec<&'a str>, bool, bool)> {
    let mut positional = Vec::new();
    let mut debug = false;
    let mut json = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing(iter, &mut positional)?;
                break;
            }
            "-d" | "--debug" | "--debug=true" => debug = true,
            "--debug=false" => debug = false,
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-dj" | "-jd" => (debug, json) = (true, true),
            val if !val.starts_with('-') && !val.is_empty() => positional.push(val),
            _ => return None,
        }
    }
    Some((positional, debug, json))
}

fn parse_list(rest: &[&str]) -> Option<Subcommand> {
    let (positional, debug, json) = parse_debug_json_args(rest)?;
    let pattern = match positional.as_slice() {
        [] => None,
        [pat] if is_supported_pattern(pat) => Some((*pat).to_owned()),
        _ => return None,
    };
    Some(Subcommand::List(ListOpts { pattern, debug, json }))
}

fn parse_get(rest: &[&str]) -> Option<Subcommand> {
    let (positional, debug, json) = parse_debug_json_args(rest)?;
    let (component, aspect_id) = match positional.as_slice() {
        [comp] if is_supported_pattern(comp) => ((*comp).to_owned(), None),
        [comp, aspect] if is_supported_pattern(comp) && !aspect.is_empty() => {
            ((*comp).to_owned(), Some((*aspect).to_owned()))
        }
        _ => return None,
    };
    Some(Subcommand::Get(GetOpts { component, aspect_id, debug, json }))
}

fn parse_list_core(rest: &[&str]) -> Option<Subcommand> {
    let mut json = false;
    let mut positional = Vec::new();
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing(iter, &mut positional)?;
                break;
            }
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            val if !val.starts_with('-') && !val.is_empty() => positional.push(val),
            _ => return None,
        }
    }
    (positional.len() <= 1).then_some(Subcommand::ListCore { json })
}

fn parse_update(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    match tokens.as_slice() {
        [aspect_id] if !aspect_id.is_empty() => {
            Some(Subcommand::Update { aspect_id: (*aspect_id).to_owned(), pattern: None })
        }
        [aspect_id, pattern] if !aspect_id.is_empty() && is_supported_pattern(pattern) => {
            Some(Subcommand::Update {
                aspect_id: (*aspect_id).to_owned(),
                pattern: Some((*pattern).to_owned()),
            })
        }
        _ => None,
    }
}

fn parse_set(rest: &[&str]) -> Option<Subcommand> {
    let mut merge = false;
    let mut positional = Vec::new();
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing(iter, &mut positional)?;
                break;
            }
            "-m" | "--merge" | "--merge=true" => merge = true,
            "--merge=false" => merge = false,
            val if !val.starts_with('-') && !val.is_empty() => positional.push(val),
            _ => return None,
        }
    }
    let (pattern, aspect_id, config) = match positional.as_slice() {
        [pattern, aspect_id] => (*pattern, *aspect_id, json!({})),
        [pattern, aspect_id, raw_cfg] => {
            let parsed: Value = bit_object_import::parse_jsonc(raw_cfg.as_bytes()).ok()?;
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
    let trimmed = pattern.trim();
    !trimmed.is_empty()
        && !trimmed.starts_with(['-', '@'])
        && !trimmed.contains(['$', ':'])
        && !trimmed.contains(" AND ")
        && !trimmed.starts_with("teambit.")
}

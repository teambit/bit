//! Native `bit version-history <sub-command>` (`vh`; [`COMMAND`], `scopes/scope/version-history/version-history-cmd.ts`).
//!
//! Coordinates [`build`], [`text`], and [`remote`] for version-history inspection and rebuilding over [`ScopeRoot`].

pub(super) mod build;
pub(super) mod text;

mod remote;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    debug_cat::{
        emit_failure, emit_text, emit_value,
        lookup::{diagnose_component_lookup_error, resolve_component_entry},
        scope_dir_for, sha1_hex,
    },
    lane::scope_root::{self, ScopeRoot},
    workspace_command,
};
use crate::native::Outcome;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io};

/// Descriptor for the native `bit version-history` (`vh`) command.
pub const COMMAND: Command = Command { name: "version-history", aliases: &["vh"], run };

/// Parsed subcommand for `bit version-history`.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Subcommand {
    ShowJson(String),
    ShowText(String, bool),
    Build(String, Option<String>, Option<String>),
    Unrecognized(String),
}

/// Parses `args` into a `bit version-history` [`Subcommand`].
fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .map(str::trim)
        .filter(|arg| {
            !arg.is_empty()
                && !matches!(
                    *arg,
                    "--no-color"
                        | "--no-color=true"
                        | "--no-color=false"
                        | "--color"
                        | "--color=true"
                        | "--color=false"
                        | "--color=always"
                        | "--color=never",
                )
        })
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["show", rest @ ..] => parse_show(rest),
        ["build", rest @ ..] => parse_build(rest),
        [sub] if !sub.starts_with('-') && !matches!(*sub, "show" | "build" | "graph") => {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_build(rest: &[&str]) -> Option<Subcommand> {
    let mut id = None;
    let mut from = None;
    let mut remote = None;
    let mut arguments = rest.iter().copied();
    while let Some(argument) = arguments.next() {
        if argument == "--" {
            super::internalize::consume_trailing_internalize(arguments, &mut id)?;
            break;
        }
        apply_build_arg(argument, &mut arguments, &mut id, &mut from, &mut remote)?;
    }
    Some(Subcommand::Build(id?, from, remote))
}

#[inline]
fn apply_build_arg<'a>(
    argument: &'a str,
    arguments: &mut impl Iterator<Item = &'a str>,
    id: &mut Option<String>,
    from: &mut Option<String>,
    remote: &mut Option<String>,
) -> Option<()> {
    match argument {
        "--from-all-lanes"
        | "--from-all-lanes=true"
        | "--from-all-lanes=false"
        | "--delete-existing"
        | "--delete-existing=true"
        | "--delete-existing=false" => {}
        "--from-snap" => set_once(from, next_non_flag(arguments)?)?,
        "--remote" => set_once(remote, next_non_flag(arguments)?)?,
        _ => apply_build_inline_or_id(argument, id, from, remote)?,
    }
    Some(())
}

#[inline]
fn apply_build_inline_or_id(
    argument: &str,
    id: &mut Option<String>,
    from: &mut Option<String>,
    remote: &mut Option<String>,
) -> Option<()> {
    if let Some(inline) = argument.strip_prefix("--from-snap=") {
        set_once(from, inline)?;
    } else if let Some(inline) = argument.strip_prefix("--remote=") {
        set_once(remote, inline)?;
    } else if !argument.starts_with('-') && !argument.is_empty() && id.is_none() {
        *id = Some(argument.to_owned());
    } else {
        return None;
    }
    Some(())
}

#[inline]
fn set_once(slot: &mut Option<String>, val: &str) -> Option<()> {
    let val = val.trim();
    (slot.is_none() && !val.is_empty() && !val.starts_with('-')).then_some(())?;
    *slot = Some(val.to_owned());
    Some(())
}

#[inline]
fn next_non_flag<'a>(arguments: &mut impl Iterator<Item = &'a str>) -> Option<&'a str> {
    let val = arguments.next()?.trim();
    (!val.is_empty() && !val.starts_with('-')).then_some(val)
}

fn parse_show(rest: &[&str]) -> Option<Subcommand> {
    let mut id = None;
    let mut json = false;
    let mut short = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                super::internalize::consume_trailing_internalize(iter, &mut id)?;
                break;
            }
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-s" | "--short-hash" | "--short-hash=true" => short = true,
            "--short-hash=false" => short = false,
            "-js" | "-sj" => {
                json = true;
                short = true;
            }
            val if !val.starts_with('-') && id.is_none() => {
                id = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    let id = id?;
    Some(if json { Subcommand::ShowJson(id) } else { Subcommand::ShowText(id, short) })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("version-history arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native version-history grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return run_without_scope(args, &subcommand);
    };
    match subcommand {
        Subcommand::Unrecognized(sub) => {
            let chalk = Chalk::detect(args);
            let msg = chalk.red(&format!(
                r#""{sub}" is not a subcommand of "version-history", please run "bit version-history --help" to list the subcommands"#,
            ));
            emit_text(&root, args, "version-history", true, msg)
        }
        Subcommand::ShowJson(id) => run_show_json(&root, args, &id),
        Subcommand::ShowText(id, short) => text::run(&root, args, &id, short),
        Subcommand::Build(id, from, Some(remote)) => {
            remote::run(&root, args, &id, from.as_deref(), &remote)
        }
        Subcommand::Build(id, from, None) => build::run(&root, args, &id, from.as_deref()),
    }
}

#[inline]
fn is_ci_active() -> bool {
    super::scope_rename::ci_active()
}

fn run_without_scope(args: &[OsString], subcommand: &Subcommand) -> io::Result<Outcome> {
    if is_ci_active() {
        return Ok(Outcome::Declined("version-history requires a scope".into()));
    }
    let cwd = env::current_dir()?;
    match subcommand {
        Subcommand::Unrecognized(sub) => {
            let msg = Chalk::detect(args).red(&format!(
                r#""{sub}" is not a subcommand of "version-history", please run "bit version-history --help" to list the subcommands"#,
            ));
            let report = workspace_command::results::Report { data: msg, code: 0, details: None };
            workspace_command::execute_with_scope(&cwd, args, "version-history", &report)
        }
        Subcommand::ShowJson(_) => super::debug_cat::emit_scope_not_found(args, "show", true),
        Subcommand::ShowText(_, _) => workspace_command::execute_failure_scope(
            &cwd,
            args,
            "show",
            false,
            "",
            io::Error::other("Cannot read properties of undefined (reading 'resolveComponentId')"),
        ),
        Subcommand::Build(_, _, None) => workspace_command::execute_failure_scope(
            &cwd,
            args,
            "build",
            false,
            "",
            io::Error::other("Cannot read properties of undefined (reading 'idsByPattern')"),
        ),
        Subcommand::Build(_, _, Some(_)) => {
            Ok(Outcome::Declined("version-history requires a scope".into()))
        }
    }
}

fn run_show_json(root: &ScopeRoot, args: &[OsString], id: &str) -> io::Result<Outcome> {
    let scope_dir = scope_dir_for(root);
    let id = id.trim();
    let bare_id = id.rsplit_once('@').map_or(id, |(bare, _)| bare.trim());
    let Some((Some(scope), name, _)) = resolve_component_entry(&scope_dir, bare_id) else {
        if !is_ci_active()
            && let Some(err) =
                diagnose_component_lookup_error(&scope_dir, id, bare_id, Chalk::detect(args))
        {
            return emit_failure(root, args, "show", true, true, err);
        }
        return Ok(Outcome::Declined("version-history show lookup delegated".into()));
    };
    let vh_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let mut val = match bit_object_import::read_scope_object(&scope_dir, &vh_hash) {
        Ok(Some((kind, val))) if kind == "VersionHistory" => val,
        Ok(None) => json!({
            "name": name,
            "scope": scope,
            "versions": [],
            "graphCompleteRefs": [],
        }),
        _ => return Ok(Outcome::Declined("version-history object invalid".into())),
    };
    let Some(map) = val.as_object_mut() else {
        return Ok(Outcome::Declined("version-history object invalid".into()));
    };
    map.insert("hash".into(), Value::String(vh_hash));
    emit_value(root, args, "show", true, &val)
}

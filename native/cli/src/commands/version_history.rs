//! Native `bit version-history <sub-command>` (`vh`) (`scopes/scope/version-history/version-history-cmd.ts`).

mod build;
#[cfg(test)]
mod tests;
mod text;

use super::{
    Command,
    color::Chalk,
    debug_cat::{emit_text, emit_value, lookup::resolve_component_entry, scope_dir_for, sha1_hex},
    lane::scope_root::{self, ScopeRoot},
    workspace_command,
};
use crate::native::Outcome;
use serde_json::{Value, json};
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "version-history", aliases: &["vh"], run };

#[derive(Debug, PartialEq, Eq)]
enum Subcommand {
    ShowJson(String),
    ShowText(String, bool),
    Build(String, Option<String>),
    Unrecognized(String),
}

fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
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
    let mut arguments = rest.iter().copied();
    while let Some(argument) = arguments.next() {
        match argument {
            "--from-all-lanes" | "--delete-existing" => {}
            "--from-snap" if from.is_none() => from = Some(arguments.next()?.to_owned()),
            value if !value.starts_with('-') && id.is_none() => id = Some(value.to_owned()),
            _ => return None,
        }
    }
    Some(Subcommand::Build(id?, from))
}

fn parse_show(rest: &[&str]) -> Option<Subcommand> {
    let mut id = None;
    let mut json = false;
    let mut short = false;
    for &arg in rest {
        match arg {
            "-j" | "--json" => json = true,
            "-s" | "--short-hash" => short = true,
            val if !val.starts_with('-') && id.is_none() => id = Some(val.to_owned()),
            _ => return None,
        }
    }
    let id = id.filter(|text| !text.is_empty())?;
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
        return Ok(Outcome::Declined("version-history requires a scope".into()));
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
        Subcommand::Build(id, from) => build::run(&root, args, &id, from.as_deref()),
    }
}

fn run_show_json(root: &ScopeRoot, args: &[OsString], id: &str) -> io::Result<Outcome> {
    let scope_dir = scope_dir_for(root);
    let (bare_id, _) = id.rsplit_once('@').unwrap_or((id, ""));
    let Some((Some(scope), name, _)) = resolve_component_entry(&scope_dir, bare_id) else {
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

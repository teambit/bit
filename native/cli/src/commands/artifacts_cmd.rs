//! Native `bit artifacts <component-pattern>` (`scopes/pipelines/builder/artifact/artifacts.cmd.ts`, `--aspect`, `--task`, `--files`, `--out-dir`).
//!
//! Extracts and renders component build artifacts across workspaces and bare scopes via [`extractor`].

mod extractor;
mod render;
mod scope;
#[cfg(test)]
mod tests;

use self::extractor::{extract_and_render, extract_scope_and_render};
use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    scope_set::Failure,
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

/// Native `bit artifacts` command descriptor.
pub const COMMAND: Command = Command { name: "artifacts", aliases: &[], run };

/// Parsed CLI options and filter arguments for `bit artifacts`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub aspect: Option<String>,
    pub task: Option<String>,
    pub files: Option<String>,
    pub out_dir: Option<String>,
}

/// Executes `bit artifacts`, dispatching workspace, bare-scope, and outside-workspace invocations.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("artifacts arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native artifacts grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI artifacts delegated".into()));
    }
    let cwd = env::current_dir()?;
    let formatter = Formatter::new(Chalk::detect(args));
    let Some(root) = workspace::root(&cwd) else {
        if let Some(scope) = scope_root::discover().ok().flatten()
            && scope.bare
        {
            return finish_scope_artifacts(&scope.path, args, &options, &formatter);
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "artifacts",
            true,
            "",
            io::Error::other("Host was not found"),
        );
    };
    if is_empty_workspace(&root).unwrap_or(false) {
        let pattern = options.pattern;
        return workspace_command::execute_without_loader(&root, args, "artifacts", move |_| {
            let msg = format!(
                "{} {}",
                formatter.warn_symbol(),
                formatter.chalk.yellow(&format!(r#"no artifacts found for "{pattern}""#)),
            );
            Ok(Report { data: msg, code: 0, details: None })
        });
    }
    finish_artifacts(&root, args, &options, &formatter)
}

/// Executes artifact extraction in workspace `root` via [`extract_and_render`] and emits the [`Outcome`].
fn finish_artifacts(
    root: &Path,
    args: &[OsString],
    options: &Options,
    formatter: &Formatter,
) -> io::Result<Outcome> {
    match extract_and_render(root, options, formatter) {
        Ok(data) => workspace_command::execute_then(root, args, "artifacts", move |_| {
            Ok(Report { data, code: 0, details: None })
        }),
        Err(Failure::User(message)) => {
            workspace_command::execute_then(root, args, "artifacts", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("artifacts: {reason}"))),
    }
}

/// Executes artifact extraction in bare scope `scope_dir` via [`extract_scope_and_render`] and emits the [`Outcome`].
fn finish_scope_artifacts(
    scope_dir: &Path,
    args: &[OsString],
    options: &Options,
    formatter: &Formatter,
) -> io::Result<Outcome> {
    match extract_scope_and_render(scope_dir, options, formatter) {
        Ok(data) => {
            workspace_command::execute_then_scope(scope_dir, args, "artifacts", move |_| {
                Ok(Report { data, code: 0, details: None })
            })
        }
        Err(Failure::User(message)) => {
            workspace_command::execute_then_scope(scope_dir, args, "artifacts", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("artifacts: {reason}"))),
    }
}

pub(super) fn is_empty_workspace(root: &Path) -> io::Result<bool> {
    if !root.is_absolute()
        || root
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
    {
        return Ok(false);
    }
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if super::build_cmd::is_bitmap_auto_sync(&ws_config) {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut aspect = None;
    let mut task = None;
    let mut files = None;
    let mut out_dir = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_pattern(iter, &mut pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "--aspect" if aspect.is_none() => aspect = Some(take_val(iter.next()?)?),
            "--task" if task.is_none() => task = Some(take_val(iter.next()?)?),
            "--files" if files.is_none() => files = Some(take_val(iter.next()?)?),
            "--out-dir" if out_dir.is_none() => out_dir = Some(take_val(iter.next()?)?),
            _ => apply_inline_or_pattern(
                arg,
                &mut pattern,
                &mut aspect,
                &mut task,
                (&mut files, &mut out_dir),
            )?,
        }
    }
    Some(Options { pattern: pattern?, aspect, task, files, out_dir })
}

fn consume_trailing_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for rest in iter {
        if pattern.is_some() {
            return None;
        }
        *pattern = Some(take_val(rest)?);
    }
    Some(())
}

fn apply_inline_or_pattern(
    arg: &str,
    pattern: &mut Option<String>,
    aspect: &mut Option<String>,
    task: &mut Option<String>,
    files_and_out: (&mut Option<String>, &mut Option<String>),
) -> Option<()> {
    if !arg.starts_with('-') {
        if pattern.is_some() {
            return None;
        }
        *pattern = Some(take_val(arg)?);
        return Some(());
    }
    let (files, out_dir) = files_and_out;
    let (flag, val) = arg.split_once('=')?;
    let slot = match flag {
        "--aspect" => aspect,
        "--task" => task,
        "--files" => files,
        "--out-dir" => out_dir,
        _ => return None,
    };
    if slot.is_some() {
        return None;
    }
    *slot = Some(take_val(val)?);
    Some(())
}

#[inline]
fn take_val(val: &str) -> Option<String> {
    let val = val.trim();
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

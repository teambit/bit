//! Native `bit artifacts <component-pattern>` (`scopes/pipelines/builder/artifact/artifacts.cmd.ts`).

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

pub const COMMAND: Command = Command { name: "artifacts", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub aspect: Option<String>,
    pub task: Option<String>,
    pub files: Option<String>,
    pub out_dir: Option<String>,
}

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
        return Ok(Outcome::Declined("artifacts outside workspace delegated".into()));
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
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
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
            "--no-color" => {}
            "--aspect" => aspect = Some(take_val(iter.next()?)?),
            "--task" => task = Some(take_val(iter.next()?)?),
            "--files" => files = Some(take_val(iter.next()?)?),
            "--out-dir" => out_dir = Some(take_val(iter.next()?)?),
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

fn apply_inline_or_pattern(
    arg: &str,
    pattern: &mut Option<String>,
    aspect: &mut Option<String>,
    task: &mut Option<String>,
    files_and_out: (&mut Option<String>, &mut Option<String>),
) -> Option<()> {
    let (files, out_dir) = files_and_out;
    if let Some(val) = arg.strip_prefix("--aspect=") {
        *aspect = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--task=") {
        *task = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--files=") {
        *files = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--out-dir=") {
        *out_dir = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if !arg.starts_with('-') && !arg.is_empty() && pattern.is_none() {
        *pattern = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

fn take_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

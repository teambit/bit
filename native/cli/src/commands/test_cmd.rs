//! Native `bit test [pattern-or-test-file...]` (`TestCmd`, alias `at`).
//!
//! Owns workspace validation and built-in single-component JSON test orchestration.
//! External Jest runs user tests; unsupported services decline before loader effects.

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    inventory,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "test", aliases: &["at"], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub user_pattern: Vec<String>,
    pub all: bool,
    pub scope: Option<String>,
    pub json: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum FastOutcome {
    Empty { stdout: String },
    Error(String),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("test arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native test grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_without_loader_scope(&cwd, args, "test", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    let chalk = Chalk::detect(args);
    let fast = match classify_workspace(&cwd, &root, &options, chalk) {
        Ok(Some(fast)) => fast,
        Ok(None) => return runner::run(&root, args, &options),
        Err(_) => return Ok(Outcome::Declined("test requires tester aspect runtime".into())),
    };
    let is_json = options.json;
    workspace_command::execute_without_loader(&root, args, "test", move |_| {
        fast_outcome_to_report(fast, is_json)
    })
}

fn fast_outcome_to_report(fast: FastOutcome, is_json: bool) -> io::Result<Report> {
    match fast {
        FastOutcome::Empty { stdout } => Ok(Report {
            data: if is_json { "[]".to_owned() } else { stdout },
            code: 0,
            details: None,
        }),
        FastOutcome::Error(err) => Err(io::Error::other(err)),
    }
}

pub(super) fn classify_workspace(
    cwd: &Path,
    root: &Path,
    options: &Options,
    chalk: Chalk,
) -> io::Result<Option<FastOutcome>> {
    let bitmap = Bitmap::load(root, None)?;
    let active_entries = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .collect::<Vec<_>>();
    if let Some(err) = validate_user_patterns(cwd, root, &options.user_pattern, &active_entries) {
        return Ok(Some(FastOutcome::Error(err)));
    }
    if active_entries.is_empty() {
        return Ok(Some(FastOutcome::Empty { stdout: empty_test_stdout(options, chalk) }));
    }
    Ok(None)
}

fn validate_user_patterns(
    cwd: &Path,
    root: &Path,
    user_pattern: &[String],
    active_entries: &[&bit_install::workspace::BitmapEntry],
) -> Option<String> {
    let mut existing_files = Vec::new();
    let mut non_files = Vec::new();
    for entry in user_pattern {
        if cwd.join(entry).is_file() {
            existing_files.push(entry.as_str());
        } else {
            non_files.push(entry.as_str());
        }
    }
    if existing_files.is_empty() {
        return None;
    }
    if !non_files.is_empty() {
        return Some(format!(
            "unable to mix test-file paths with component patterns. the following are not files: {}",
            non_files.join(", "),
        ));
    }
    existing_files
        .into_iter()
        .find(|entry| !file_belongs_to_any_component(&cwd.join(entry), root, active_entries))
        .map(|entry| {
            format!(
                r#"the file "{entry}" does not belong to any component in this workspace, unable to test it"#,
            )
        })
}

fn file_belongs_to_any_component(
    abs: &Path,
    root: &Path,
    active_entries: &[&bit_install::workspace::BitmapEntry],
) -> bool {
    let Some(rel_path) = abs
        .strip_prefix(root)
        .ok()
        .and_then(|path| path.to_str())
        .map(inventory::normalize)
    else {
        return false;
    };
    active_entries
        .iter()
        .any(|comp| {
            let root_dir = comp.root_dir.trim_end_matches('/');
            !root_dir.is_empty()
                && (rel_path == root_dir || rel_path.starts_with(&format!("{root_dir}/")))
        })
}

fn empty_test_stdout(options: &Options, chalk: Chalk) -> String {
    let mut lines = Vec::new();
    if options.scope.is_some() {
        lines.push(chalk.yellow(
            r#"warning: "--scope" flag is deprecated, please use "<scope>/*" pattern instead"#,
        ));
    }
    if options.all {
        lines.push(chalk.yellow(
            r#"warning: "--all" flag is deprecated, please use "--unmodified" flag instead"#,
        ));
    }
    lines.push(format!(
        "{}\n{}",
        chalk.yellow("no components found to test."),
        chalk.yellow(
            r#"use "--unmodified" flag to test all components or specify the ids to test.
otherwise, only new and modified components will be tested"#,
        ),
    ));
    lines.join("\n")
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options { user_pattern: Vec::new(), all: false, scope: None, json: false };
    let mut iter = args.iter().copied();
    while let Some(token) = iter.next() {
        if token == "--" {
            options.user_pattern.extend(iter.map(str::to_owned));
            break;
        }
        apply_test_token(token, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_test_token<'a>(
    token: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match token {
        "--watch" | "-w" | "--debug" | "-d" | "--unmodified" | "-u" | "--coverage"
        | "--update-snapshot" | "--verbose" | "--summary" => {}
        "--all" | "-a" => options.all = true,
        "--json" | "-j" => options.json = true,
        "--junit" | "--env" | "-e" => {
            take_test_val(iter.next()?)?;
        }
        "--scope" | "-s" => options.scope = Some(take_test_val(iter.next()?)?),
        _ => apply_inline_test_token(token, options)?,
    }
    Some(())
}

fn apply_inline_test_token(token: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = token.strip_prefix("--scope=") {
        options.scope = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = token
        .strip_prefix("--junit=")
        .or_else(|| token.strip_prefix("--env="))
    {
        (!val.is_empty()).then_some(())?;
    } else if token.starts_with('-') {
        return None;
    } else {
        options.user_pattern.push(token.to_owned());
    }
    Some(())
}

fn take_test_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

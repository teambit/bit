//! Native `bit validate [component-pattern]` (`scopes/defender/validator/validate.cmd.ts`).

mod lint_and_types;
mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    scope_set::{Failure, selection},
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_object_import::{component_remove::select_ids, parse_jsonc};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "validate", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";
const VALID_TASKS: &[&str] = &["check-types", "lint", "test"];

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub all: bool,
    pub unmodified: bool,
    pub fail_fast: bool,
    pub continue_on_error: bool,
    pub skip_tasks: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("validate arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native validate grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI validate delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_without_loader_scope(&cwd, args, "validate", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    let chalk = Chalk::detect(args);
    if let Ok(Some(fast)) = classify_workspace(&root, &options, chalk) {
        let formatter = Formatter::new(chalk);
        return workspace_command::execute_without_loader(&root, args, "validate", |output| {
            emit_fast(&options, fast, &formatter, output)
        });
    }
    if let Some(outcome) = runner::try_run(&root, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("validate runner execution delegated".into()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum FastOutcome {
    Empty,
    Error(String),
    InvalidSkipTasks { count: usize, invalid: Vec<String> },
    SkippedAll { count: usize },
}

fn emit_fast(
    options: &Options,
    fast: FastOutcome,
    formatter: &Formatter,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let mut lines = collect_deprecation_warnings(options, formatter);
    lines.push(format!("\n{}\n", formatter.title("Running validation checks...")));
    match fast {
        FastOutcome::Empty => {
            let msg = "No components found to validate";
            lines.push(formatter.hint(msg));
            lines.push(msg.into());
            Ok(Report { data: lines.join("\n"), code: 0, details: None })
        }
        FastOutcome::Error(msg) => {
            for line in &lines {
                output.console(line);
            }
            Err(io::Error::other(msg))
        }
        FastOutcome::InvalidSkipTasks { count, invalid } => {
            for line in &lines {
                output.console(line);
            }
            output.console(&format!("Validating {count} component(s)\n"));
            Err(io::Error::other(format!(
                "unknown skip-tasks: {}. available tasks: {}",
                invalid.join(", "),
                VALID_TASKS.join(", "),
            )))
        }
        FastOutcome::SkippedAll { count } => {
            lines.push(format!("Validating {count} component(s)\n"));
            lines.push(format!(
                "\n{} {}\n",
                formatter.warn_symbol(),
                formatter.chalk.yellow("All validation tasks were skipped"),
            ));
            lines.push("All validation tasks were skipped".into());
            Ok(Report { data: lines.join("\n"), code: 0, details: None })
        }
    }
}

fn collect_deprecation_warnings(options: &Options, formatter: &Formatter) -> Vec<String> {
    let mut lines = Vec::new();
    if options.all {
        lines.push(formatter.chalk.yellow(
            "warning: --all is deprecated, use --unmodified instead",
        ));
    }
    if options.continue_on_error {
        let msg = "--continue-on-error is deprecated and will be removed in a future version. This is now the default behavior.";
        lines.push(formatter.chalk.yellow(&format!("warning: {msg}")));
    }
    lines
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            super::internalize::consume_trailing_internalize(iter, &mut options.pattern)?;
            break;
        }
        apply_validate_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_validate_token<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    if apply_validate_combined_short(arg, options) {
        return Some(());
    }
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-a" | "--all" | "--all=true" => options.all = true,
        "--all=false" => options.all = false,
        "-u" | "--unmodified" | "--unmodified=true" => options.unmodified = true,
        "--unmodified=false" => options.unmodified = false,
        "--fail-fast" | "--fail-fast=true" => options.fail_fast = true,
        "--fail-fast=false" => options.fail_fast = false,
        "-c" | "--continue-on-error" | "--continue-on-error=true" => {
            options.continue_on_error = true;
        }
        "--continue-on-error=false" => options.continue_on_error = false,
        "--skip-tasks" => {
            let val = iter.next()?.trim();
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.skip_tasks = Some(val.to_owned());
        }
        _ => apply_validate_inline_or_pattern(arg, options)?,
    }
    Some(())
}

fn apply_validate_combined_short(arg: &str, options: &mut Options) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'a' | b'u' | b'c'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'a' => options.all = true,
            b'u' => options.unmodified = true,
            _ => options.continue_on_error = true,
        }
    }
    true
}

fn apply_validate_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--skip-tasks=") {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.skip_tasks = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.trim().is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.trim().to_owned());
    } else {
        return None;
    }
    Some(())
}

pub(super) fn classify_workspace(
    root: &Path,
    options: &Options,
    chalk: Chalk,
) -> io::Result<Option<FastOutcome>> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if super::build_cmd::is_bitmap_auto_sync(&ws_config) {
        return Ok(None);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let all_count = active_component_count(&bitmap);
    if all_count == 0 && options.pattern.is_none() {
        return Ok(Some(FastOutcome::Empty));
    }
    if let Some(pat) = &options.pattern {
        let default_scope = super::aspect::workspace_default_scope(&ws_config).ok();
        let loaded_bitmap = Bitmap::load(root, default_scope.as_deref())?;
        if let Err(Failure::User(msg)) =
            selection::resolve_pattern_entries(root, &loaded_bitmap, pat, chalk)
        {
            return Ok(Some(FastOutcome::Error(msg)));
        }
    }
    let Some(raw_skip) = &options.skip_tasks else {
        return Ok(None);
    };
    classify_skip_tasks(root, options, raw_skip, all_count)
}

fn classify_skip_tasks(
    root: &Path,
    options: &Options,
    raw_skip: &str,
    all_count: usize,
) -> io::Result<Option<FastOutcome>> {
    let parsed_tasks = raw_skip
        .split(',')
        .map(str::trim)
        .filter(|task| !task.is_empty())
        .collect::<Vec<_>>();
    let invalid = parsed_tasks
        .iter()
        .filter(|task| !VALID_TASKS.contains(task))
        .map(|task| (*task).to_owned())
        .collect::<Vec<_>>();
    let skipped_all = VALID_TASKS
        .iter()
        .all(|task| parsed_tasks.contains(task));
    if invalid.is_empty() && !skipped_all {
        return Ok(None);
    }
    let Some(count) = matched_validate_count(root, options, all_count) else {
        return Ok(None);
    };
    if count == 0 {
        return Ok(Some(FastOutcome::Empty));
    }
    if !invalid.is_empty() {
        return Ok(Some(FastOutcome::InvalidSkipTasks { count, invalid }));
    }
    Ok(Some(FastOutcome::SkippedAll { count }))
}

fn matched_validate_count(root: &Path, options: &Options, all_count: usize) -> Option<usize> {
    if let Some(pat) = &options.pattern {
        select_ids(root, pat).ok().map(|ids| ids.len())
    } else if options.unmodified || options.all {
        Some(all_count)
    } else {
        None
    }
}

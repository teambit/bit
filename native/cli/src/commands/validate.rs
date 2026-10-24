//! Native `bit validate [component-pattern]` (`scopes/defender/validator/validate.cmd.ts`).

mod lint_and_types;
mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::{component_remove::select_ids, parse_jsonc};
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "validate", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";
const VALID_TASKS: &[&str] = &["check-types", "lint", "test"];

#[derive(Debug, Clone, PartialEq, Eq)]
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
    if let Ok(Some(fast)) = classify_workspace(&root, &options) {
        let chalk = Chalk::detect(args);
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
    InvalidSkipTasks { count: usize, invalid: Vec<String> },
    SkippedAll { count: usize },
}

fn emit_fast(
    options: &Options,
    fast: FastOutcome,
    formatter: &Formatter,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let mut lines = collect_deprecation_warnings(options, formatter, output);
    lines.push(format!("\n{}\n", formatter.title("Running validation checks...")));
    match fast {
        FastOutcome::Empty => {
            let msg = "No components found to validate";
            lines.push(formatter.hint(msg));
            lines.push(msg.into());
            Ok(Report { data: lines.join("\n"), code: 0, details: None })
        }
        FastOutcome::InvalidSkipTasks { count, invalid } => {
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

fn collect_deprecation_warnings(
    options: &Options,
    formatter: &Formatter,
    output: &bit_install::output::Output,
) -> Vec<String> {
    let mut lines = Vec::new();
    if options.all {
        output.warning("--all is deprecated, use --unmodified instead");
        lines.push(formatter.chalk.yellow(
            "warning: --all is deprecated, use --unmodified instead",
        ));
    }
    if options.continue_on_error {
        let msg = "--continue-on-error is deprecated and will be removed in a future version. This is now the default behavior.";
        output.warning(msg);
        lines.push(formatter.chalk.yellow(&format!("warning: {msg}")));
    }
    lines
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut all = false;
    let mut unmodified = false;
    let mut fail_fast = false;
    let mut continue_on_error = false;
    let mut skip_tasks = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--no-color" => {}
            "-a" | "--all" => all = true,
            "-u" | "--unmodified" => unmodified = true,
            "--fail-fast" => fail_fast = true,
            "-c" | "--continue-on-error" => continue_on_error = true,
            "--skip-tasks" => {
                let val = iter.next()?;
                if val.starts_with('-') {
                    return None;
                }
                skip_tasks = Some(val.to_owned());
            }
            arg if arg.starts_with("--skip-tasks=") => {
                skip_tasks = Some(arg["--skip-tasks=".len()..].to_owned());
            }
            val if !val.starts_with('-') && !val.is_empty() && pattern.is_none() => {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern, all, unmodified, fail_fast, continue_on_error, skip_tasks })
}

pub(super) fn classify_workspace(
    root: &Path,
    options: &Options,
) -> io::Result<Option<FastOutcome>> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(None);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let all_count = active_component_count(&bitmap);
    if all_count == 0 && options.pattern.is_none() {
        return Ok(Some(FastOutcome::Empty));
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

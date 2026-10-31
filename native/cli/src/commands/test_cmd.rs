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
    remote_action::startup,
    scope_set::{Failure, selection},
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "test", aliases: &["at"], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

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
    emit_fast_outcome(&root, args, options, fast)
}

fn emit_fast_outcome(
    root: &Path,
    args: &[OsString],
    options: Options,
    fast: FastOutcome,
) -> io::Result<Outcome> {
    match fast {
        FastOutcome::Empty { stdout } => {
            let is_json = options.json;
            workspace_command::execute_without_loader(root, args, "test", move |_| {
                Ok(Report {
                    data: if is_json { "[]".to_owned() } else { stdout },
                    code: 0,
                    details: None,
                })
            })
        }
        FastOutcome::Error(err) if options.json => {
            workspace_command::execute_json(root, args, "test", move |_| Err(io::Error::other(err)))
        }
        FastOutcome::Error(err) => {
            workspace_command::execute_then(root, args, "test", move |output| {
                runner::warnings(output, &options);
                Err(io::Error::other(err))
            })
        }
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
    if env::var_os("CI").is_none_or(|val| val.is_empty())
        && options.user_pattern
            .iter()
            .all(|entry| !cwd.join(entry).is_file())
        && let Some(err) = validate_test_pattern(root, options, chalk)
    {
        return Ok(Some(FastOutcome::Error(err)));
    }
    if active_entries.is_empty() {
        return Ok(Some(FastOutcome::Empty { stdout: empty_test_stdout(options, chalk) }));
    }
    Ok(None)
}

fn validate_test_pattern(root: &Path, options: &Options, chalk: Chalk) -> Option<String> {
    let pat = effective_pattern(options)?;
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if !startup::service_supported(root, &ws_config).ok()?
        || super::build_cmd::is_bitmap_auto_sync(&ws_config)
    {
        return None;
    }
    let default_scope = super::aspect::workspace_default_scope(&ws_config).ok();
    let bitmap = Bitmap::load(root, default_scope.as_deref()).ok()?;
    match selection::resolve_pattern_entries(root, &bitmap, &pat, chalk) {
        Err(Failure::User(msg)) => Some(msg),
        _ => None,
    }
}

fn effective_pattern(options: &Options) -> Option<String> {
    let scope = (!options.json).then_some(options.scope.as_deref()).flatten();
    if options.user_pattern.is_empty() && scope.is_none() {
        return None;
    }
    let pat = if options.user_pattern.is_empty() {
        "**".to_owned()
    } else {
        options.user_pattern.join(", ")
    };
    Some(match scope {
        Some(scope_name) => format!("{scope_name}/{pat}"),
        None => pat,
    })
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
        .map(|path| inventory::normalize(&path.replace(std::path::MAIN_SEPARATOR, "/")))
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
            for rest in iter {
                options.user_pattern.push(take_test_val(rest)?);
            }
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
        "--no-color"
        | "--no-color=true"
        | "--no-color=false"
        | "--watch"
        | "--watch=true"
        | "--watch=false"
        | "-w"
        | "--debug"
        | "--debug=true"
        | "--debug=false"
        | "-d"
        | "--unmodified"
        | "--unmodified=true"
        | "--unmodified=false"
        | "-u"
        | "--coverage"
        | "--coverage=true"
        | "--coverage=false"
        | "--update-snapshot"
        | "--update-snapshot=true"
        | "--update-snapshot=false"
        | "--verbose"
        | "--verbose=true"
        | "--verbose=false"
        | "--summary"
        | "--summary=true"
        | "--summary=false" => {}
        "--all" | "--all=true" | "-a" => options.all = true,
        "--all=false" => options.all = false,
        "--json" | "--json=true" | "-j" => options.json = true,
        "--json=false" => options.json = false,
        "--junit" | "--env" | "-e" => {
            take_test_val(iter.next()?)?;
        }
        "--scope" | "-s" => options.scope = Some(take_test_val(iter.next()?)?),
        _ => apply_inline_test_token(token, options)?,
    }
    Some(())
}

fn apply_inline_test_token(token: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = token
        .strip_prefix("--scope=")
        .or_else(|| token.strip_prefix("-s="))
    {
        options.scope = Some(take_test_val(val)?);
    } else if let Some(val) = token
        .strip_prefix("--junit=")
        .or_else(|| token.strip_prefix("--env="))
        .or_else(|| token.strip_prefix("-e="))
    {
        take_test_val(val)?;
    } else if apply_combined_short(token, options) {
    } else if token.starts_with('-') {
        return None;
    } else {
        options.user_pattern.push(take_test_val(token)?);
    }
    Some(())
}

fn apply_combined_short(token: &str, options: &mut Options) -> bool {
    let Some(flags) = token.strip_prefix('-') else {
        return false;
    };
    if flags.len() < 2
        || flags.starts_with('-')
        || !flags
            .chars()
            .all(|ch| matches!(ch, 'w' | 'd' | 'u' | 'a' | 'j'))
    {
        return false;
    }
    for ch in flags.chars() {
        match ch {
            'a' => options.all = true,
            'j' => options.json = true,
            _ => {}
        }
    }
    true
}

fn take_test_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

//! Released `ShowCmd` help and argument errors before workspace loading.
//!
//! [`try_run`] ([`presentation`], [`argument_error`], [`command_help`]) formats `--help` ([`help_option`], [`GLOBAL_HELP`]) and missing-argument diagnostics with [`Chalk`].

use crate::{
    commands::{app_cmd::GLOBAL_HELP, color::Chalk, run_cmd::help_option},
    native::Outcome,
};
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

/// Emits `ShowCmd` `--help` output or missing-ID usage diagnostics before workspace loading.
pub(super) fn try_run(args: &[OsString], argv: &[&str]) -> io::Result<Option<Outcome>> {
    let Some((code, error)) = presentation(argv) else {
        return Ok(None);
    };
    let chalk = Chalk::detect(args);
    let mut output = command_help(chalk);
    if let Some(error) = error
        .map(str::trim)
        .filter(|err| !err.is_empty())
    {
        output.push('\n');
        output.push_str(&chalk.yellow(error));
        output.push('\n');
    }
    io::stdout().lock().write_all(output.as_bytes())?;
    Ok(Some(Outcome::Exit(code)))
}

/// Returns `true` when `token` is a non-empty positional component ID argument.
#[inline]
fn is_positional_id(token: &str) -> bool {
    let trimmed = token.trim();
    !trimmed.is_empty() && !trimmed.starts_with('-')
}

/// Extracts a leading or trailing positional component ID from `argv` and returns `(has_id, remaining_flags)`.
#[inline]
fn split_id_from_argv<'a>(argv: &'a [&'a str]) -> (bool, &'a [&'a str]) {
    match argv {
        [id, rest @ ..] if is_positional_id(id) => (true, rest),
        [rest @ .., id] if is_positional_id(id) => (true, rest),
        rest => (false, rest),
    }
}

/// Evaluates `argv` for `--help` or missing-ID errors and returns `(exit_code, optional_warning)` via [`argument_error`].
fn presentation(argv: &[&str]) -> Option<(ExitCode, Option<&'static str>)> {
    let (id, flags) = split_id_from_argv(argv);
    let (help, flags) = match flags {
        [rest @ .., "--help" | "-h"] | ["--help" | "-h", rest @ ..] => (true, rest),
        rest => (false, rest),
    };
    if !flags
        .iter()
        .all(|flag| {
            matches!(
                flag.trim(),
                "-j" | "--json"
                    | "-l"
                    | "--legacy"
                    | "-r"
                    | "--remote"
                    | "-b"
                    | "--browser"
                    | "-c"
                    | "--compare"
                    | "--no-color",
            )
        })
    {
        return None;
    }
    if help {
        return Some((if id { ExitCode::SUCCESS } else { ExitCode::FAILURE }, None));
    }
    argument_error(id, flags).map(|error| (ExitCode::FAILURE, Some(error)))
}

/// Returns the missing-argument or unknown-flag diagnostic string for `bit show` when `id` or `flags` is invalid for [`presentation`].
#[inline]
fn argument_error(id: bool, flags: &[&str]) -> Option<&'static str> {
    if !id {
        Some("Not enough non-option arguments: got 0, need at least 1")
    } else if flags == ["--no-color"] {
        Some("Unknown arguments: no-color, noColor")
    } else {
        None
    }
}

#[inline]
fn command_help(chalk: Chalk) -> String {
    let description = chalk.bold("display component metadata, dependencies, and configuration");
    let component = chalk.green("  component-name");
    let json = help_option(chalk, "-j", "--json");
    let legacy = help_option(chalk, "-l", "--legacy");
    let remote = help_option(chalk, "-r", "--remote");
    let browser = help_option(chalk, "-b", "--browser");
    let compare = help_option(chalk, "-c", "--compare");
    format!(
        "bit show <component-name>\n\n{description}\nshows detailed information about a component including its version, dependencies, environment, and other metadata.\nnote: to see file changes made in a specific version, use `bit diff <component> <version> --parent`.\n\nArguments:\n{component}  component name or component id  [required]\n\nOptions\n  {json}     return the component data in json format  [boolean]\n  {legacy}   use the legacy bit show.  [boolean]\n  {remote}   show data for a remote component  [boolean]\n  {browser}  open the component page in the browser  [boolean]\n  {compare}  legacy-only. compare current file system component to its latest tagged version [default=latest]  [boolean]\n\n{GLOBAL_HELP}\n",
    )
}

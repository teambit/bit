//! Released `ShowCmd` help and argument errors before workspace loading.

use crate::{
    commands::{app_cmd::GLOBAL_HELP, color::Chalk, run_cmd::help_option},
    native::Outcome,
};
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub(super) fn try_run(args: &[OsString], argv: &[&str]) -> io::Result<Option<Outcome>> {
    let Some((code, error)) = presentation(argv) else {
        return Ok(None);
    };
    let chalk = Chalk::detect(args);
    let mut output = command_help(chalk);
    if let Some(error) = error {
        output.push('\n');
        output.push_str(&chalk.yellow(error));
        output.push('\n');
    }
    io::stdout().lock().write_all(output.as_bytes())?;
    Ok(Some(Outcome::Exit(code)))
}

fn presentation(argv: &[&str]) -> Option<(ExitCode, Option<&'static str>)> {
    let (id, flags) = match argv {
        [id, rest @ ..] if !id.trim().is_empty() && !id.trim().starts_with('-') => (true, rest),
        rest => (false, rest),
    };
    let (help, flags) = match flags {
        [rest @ .., "--help" | "-h"] => (true, rest),
        rest => (false, rest),
    };
    if !flags
        .iter()
        .all(|flag| {
            matches!(
                *flag,
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

fn argument_error(id: bool, flags: &[&str]) -> Option<&'static str> {
    if !id {
        Some("Not enough non-option arguments: got 0, need at least 1")
    } else if flags == ["--no-color"] {
        Some("Unknown arguments: no-color, noColor")
    } else {
        None
    }
}

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

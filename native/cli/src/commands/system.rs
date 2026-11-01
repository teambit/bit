//! Native `bit system <sub-command>` (`SystemCmd` and `SystemLogCmd` in `scopes/harmony/global-config/system.cmd.ts`).
//!
//! Resolves `debug.log` in [`cache_root`] and records invocations in [`History`] into [`Outcome`].

#[cfg(test)]
mod tests;

use super::{Command, color::Chalk, workspace_command};
use crate::{history::History, native::Outcome, workspace};
use bit_workspace_config::cache_root;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "system", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
enum Parsed {
    Log,
    Unrecognized(String),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(parsed) = parse_args(args) else {
        return Ok(Outcome::Declined("arguments outside the native `system` grammar".to_owned()));
    };
    let chalk = Chalk::detect(args);
    match parsed {
        Parsed::Log => run_log(args),
        Parsed::Unrecognized(sub) => run_unrecognized(args, &sub, chalk),
    }
}

fn parse_args(args: &[OsString]) -> Option<Parsed> {
    let raw_tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let tokens = super::scope_set::collect_non_flag_tokens(&raw_tokens)?;
    let [sub] = tokens.as_slice() else {
        return None;
    };
    let sub = sub.trim();
    if sub.is_empty() || sub.starts_with('-') || sub == "tail-log" {
        return None;
    }
    if sub == "log" { Some(Parsed::Log) } else { Some(Parsed::Unrecognized(sub.to_owned())) }
}

#[inline]
fn start_history(args: &[OsString]) -> Option<History> {
    env::current_dir()
        .ok()
        .and_then(|cwd| workspace::root(&cwd))
        .map(|root| History::start(&root, args))
}

fn run_log(args: &[OsString]) -> io::Result<Outcome> {
    let log_path = cache_root().join("logs").join("debug.log");
    let content = match fs::read_to_string(&log_path) {
        Ok(content) => content,
        Err(err) => {
            if super::scope_rename::ci_active() {
                return Ok(Outcome::Declined("debug.log is missing or unreadable".to_owned()));
            }
            if let Some(history) = start_history(args) {
                history.end(false);
            }
            let report = workspace_command::filesystem_error::report(
                &workspace_command::filesystem_error::failure(err, "open", &log_path),
                Chalk::detect(args),
            );
            writeln!(io::stdout(), "{report}")?;
            return Ok(Outcome::Exit(ExitCode::FAILURE));
        }
    };
    let history = start_history(args);
    writeln!(io::stdout(), "{content}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let history = start_history(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "system"..."#);
    output.stop();
    writeln!(io::stdout(), "{}", format_unrecognized(sub, chalk))?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

#[inline]
fn format_unrecognized(sub: &str, chalk: Chalk) -> String {
    let sub = sub.trim();
    chalk.red(&format!(
        r#""{sub}" is not a subcommand of "system", please run "bit system --help" to list the subcommands"#,
    ))
}

//! Native dispatch: the first argument names a command, and a command the
//! [`commands`] table implements runs in process via [`run`] into [`Outcome`] unless it
//! declines its input or `BIT_NATIVE=off` is set.
//!
//! Emits dispatch diagnostics via [`trace`] and [`warn_fallback`] when `BIT_NATIVE_TRACE=1` is enabled.

#[cfg(test)]
mod native_tests;

use crate::{commands, trace};
use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal},
    process::ExitCode,
};

/// Dispatch outcome of a native command: an [`ExitCode`] or a [`Outcome::Declined`] fallback reason.
#[derive(Debug, Clone)]
pub enum Outcome {
    /// The command ran; exit with this code.
    Exit(ExitCode),
    /// The command does not handle this input (an unknown flag, `--help`, an
    /// unsupported workspace): run the Node.js CLI instead. The reason is
    /// traced, and shown in the fallback warning.
    Declined(String),
}

/// Returns `Some(code)` when a native command handled `args`, or `Ok(None)` to delegate to the Node.js CLI.
pub fn run(args: &[OsString]) -> io::Result<Option<ExitCode>> {
    if env::var_os("BIT_NATIVE")
        .is_some_and(|value| {
            value
                .to_string_lossy()
                .trim()
                .eq_ignore_ascii_case("off")
        })
    {
        trace::log("BIT_NATIVE=off: delegating every command");
        return Ok(None);
    }
    let Some(name) = args
        .first()
        .and_then(|name| name.to_str())
        .map(str::trim)
    else {
        return Ok(None);
    };
    let Some(command) = commands::find(name) else {
        return Ok(None);
    };
    trace::log(format!("running `{}` natively", command.name));
    match (command.run)(args)? {
        Outcome::Exit(code) => Ok(Some(code)),
        Outcome::Declined(reason) => {
            trace::log(format!("`{}` declined: {reason}", command.name));
            warn_fallback(command.name, &reason, args);
            Ok(None)
        }
    }
}

/// Tell the user a command with a native implementation falls back to the
/// Node.js CLI, on stderr so stdout stays the Node.js CLI's own. Not with
/// `BIT_NATIVE_TRACE`, which already prints the reason, nor for `--help`, nor
/// with `BIT_NATIVE_QUIET=1`.
fn warn_fallback(name: &str, reason: &str, args: &[OsString]) {
    let has_flag = |flags: &[&str]| {
        args.iter()
            .skip(1)
            .any(|arg| {
                arg.to_str()
                    .is_some_and(|raw| flags.contains(&raw.trim()))
            })
    };
    if trace::enabled() || has_flag(&["--help", "-h"]) {
        return;
    }
    let quiet = env::var_os("BIT_NATIVE_QUIET")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty()
                && trimmed != "0"
                && !["false", "off", "no"]
                    .iter()
                    .any(|word| trimmed.eq_ignore_ascii_case(word))
        });
    if quiet {
        return;
    }
    let message = fallback_message(name, reason);
    let no_color = env::var_os("NO_COLOR").is_some_and(|val| !val.is_empty())
        || has_flag(&["--no-color", "--no-color=true"]);
    if io::stderr().is_terminal() && !no_color {
        eprintln!("\u{1b}[33m{message}\u{1b}[39m");
    } else {
        eprintln!("{message}");
    }
}

/// Formats the fallback warning message for `name` and `reason`.
#[must_use]
#[inline]
fn fallback_message(name: &str, reason: &str) -> String {
    format!("\u{26A0} bit-native: `{name}` runs on the Node.js CLI: {reason}")
}

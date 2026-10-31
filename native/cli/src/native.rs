//! Native dispatch: the first argument names a command, and a command the
//! [`commands`] table implements runs in process unless it
//! declines its input or `BIT_NATIVE=off` is set.

#[cfg(test)]
mod native_tests;

use crate::{commands, trace};
use std::{
    env,
    ffi::OsString,
    io::{self, IsTerminal},
    process::ExitCode,
};

/// What a native command did with its arguments.
#[derive(Debug)]
pub enum Outcome {
    /// The command ran; exit with this code.
    Exit(ExitCode),
    /// The command does not handle this input (an unknown flag, `--help`, an
    /// unsupported workspace): run the Node.js CLI instead. The reason is
    /// traced, and shown in the fallback warning.
    Declined(String),
}

/// `Some(code)` when a native command handled `args`.
pub fn run(args: &[OsString]) -> io::Result<Option<ExitCode>> {
    if env::var_os("BIT_NATIVE").is_some_and(|value| value == "off") {
        trace::log("BIT_NATIVE=off: delegating every command");
        return Ok(None);
    }
    let Some(name) = args.first().and_then(|name| name.to_str()) else {
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
    let quiet =
        env::var_os("BIT_NATIVE_QUIET").is_some_and(|value| !value.is_empty() && value != "0");
    let help = args
        .iter()
        .skip(1)
        .any(|arg| arg == "--help" || arg == "-h");
    if quiet || help || trace::enabled() {
        return;
    }
    let message = fallback_message(name, reason);
    let colored = io::stderr().is_terminal() && env::var_os("NO_COLOR").is_none();
    if colored {
        eprintln!("\u{1b}[33m{message}\u{1b}[39m");
    } else {
        eprintln!("{message}");
    }
}

/// The fallback warning's text.
fn fallback_message(name: &str, reason: &str) -> String {
    format!("\u{26A0} bit-native: `{name}` runs on the Node.js CLI: {reason}")
}

//! Native dispatch: the first argument names a command, and a command the
//! [`commands`] table implements runs in process unless it
//! declines its input or `BIT_NATIVE=off` is set.

use crate::{commands, trace};
use std::{env, ffi::OsString, io, process::ExitCode};

/// What a native command did with its arguments.
#[derive(Debug)]
pub enum Outcome {
    /// The command ran; exit with this code.
    Exit(ExitCode),
    /// The command does not handle this input (an unknown flag, `--help`, an
    /// unsupported workspace): run the Node.js CLI instead. The reason is
    /// only traced.
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
            Ok(None)
        }
    }
}

//! Native `bit version` ([`COMMAND`]; `VersionCmd` in `scopes/harmony/cli/version.cmd.ts`).
//!
//! Resolves the installed Bit version via [`NodeCli`], formats output with [`render_version`], and records invocations in [`History`] into [`Outcome`].

#[cfg(test)]
mod tests;

use super::{Command, workspace_command::NodeCli};
use crate::{history::History, native::Outcome, workspace};
use serde_json::json;
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

/// Descriptor for the native `bit version` command ([`COMMAND`]).
pub const COMMAND: Command = Command { name: "version", aliases: &[], run };

/// Entry point for `bit version` ([`COMMAND`]) that parses [`parse_json_flag`] and prints [`render_version`].
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(json) = parse_json_flag(args) else {
        return Ok(Outcome::Declined("arguments outside the native `version` grammar".to_owned()));
    };
    let Ok(cli) = NodeCli::find() else {
        return Ok(Outcome::Declined("unable to locate Bit CLI package version".to_owned()));
    };
    let version = cli.version.trim();
    if version.is_empty() {
        return Ok(Outcome::Declined("empty Bit CLI version".to_owned()));
    }
    let history = workspace::root(&env::current_dir()?).map(|root| History::start(&root, args));
    let mut stdout = io::stdout().lock();
    let text = render_version(version, json)?;
    if json {
        write!(stdout, "{text}")?;
    } else {
        writeln!(stdout, "{text}")?;
    }
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// Parses `-j` / `--json` and color flags from `args`, returning `None` on unrecognized arguments.
#[inline]
fn parse_json_flag(args: &[OsString]) -> Option<bool> {
    let mut json = false;
    let mut iter = args.iter().skip(1);
    while let Some(raw) = iter.next() {
        match raw.to_str()?.trim() {
            "--" => return iter.next().is_none().then_some(json),
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => return None,
        }
    }
    Some(json)
}

/// Formats `version` as plain text or pretty-printed `{ "bit": version }` JSON when `json` is `true`.
#[inline]
fn render_version(version: &str, json: bool) -> io::Result<std::borrow::Cow<'_, str>> {
    if json {
        serde_json::to_string_pretty(&json!({ "bit": version }))
            .map(std::borrow::Cow::Owned)
            .map_err(io::Error::other)
    } else {
        Ok(std::borrow::Cow::Borrowed(version))
    }
}

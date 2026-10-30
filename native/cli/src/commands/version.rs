//! Native `bit version` (`VersionCmd` in `scopes/harmony/cli/version.cmd.ts`).

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

pub const COMMAND: Command = Command { name: "version", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(json) = parse_json_flag(args) else {
        return Ok(Outcome::Declined("arguments outside the native `version` grammar".to_owned()));
    };
    let Ok(cli) = NodeCli::find() else {
        return Ok(Outcome::Declined("unable to locate Bit CLI package version".to_owned()));
    };
    if cli.version.is_empty() {
        return Ok(Outcome::Declined("empty Bit CLI version".to_owned()));
    }
    let text = render_version(&cli.version, json)?;
    let history = workspace::root(&env::current_dir()?).map(|root| History::start(&root, args));
    if json {
        write!(io::stdout(), "{text}")?;
    } else {
        writeln!(io::stdout(), "{text}")?;
    }
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_json_flag(args: &[OsString]) -> Option<bool> {
    let mut json = false;
    let rest = &args[1..];
    for (idx, raw) in rest.iter().enumerate() {
        let token = raw.to_str()?;
        match token {
            "--" => return (idx + 1 == rest.len()).then_some(json),
            "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => return None,
        }
    }
    Some(json)
}

fn render_version(version: &str, json: bool) -> io::Result<String> {
    if json {
        serde_json::to_string_pretty(&json!({ "bit": version })).map_err(io::Error::other)
    } else {
        Ok(version.to_owned())
    }
}

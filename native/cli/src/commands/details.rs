//! Native `bit details` (`DetailsCmd` in `scopes/harmony/cli/details.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, color::Chalk, status::cache, workspace_command::format::Formatter};
use crate::native::Outcome;
use serde_json::{Map, Value};
use std::{
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "details", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    if !valid_args(args) {
        return Ok(Outcome::Declined("arguments outside the native `details` grammar".to_owned()));
    }
    let chalk = Chalk::detect(args);
    let dir = cache::cache_root().join("last-command-details");
    let text = render_details(&dir, chalk)?;
    writeln!(io::stdout(), "{text}")?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn valid_args(args: &[OsString]) -> bool {
    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        match arg.to_str() {
            Some("--no-color") => {}
            Some("--") => return iter.next().is_none(),
            _ => return false,
        }
    }
    true
}

fn render_details(dir: &Path, chalk: Chalk) -> io::Result<String> {
    let content_path = dir.join("content");
    if !content_path.exists() {
        return Ok(chalk.yellow(
            r#"no details available. run a command like "bit tag" or "bit snap" first."#,
        ));
    }
    let content = fs::read_to_string(&content_path)?;
    let meta_raw = fs::read_to_string(dir.join("meta.json")).unwrap_or_else(|_| "{}".to_owned());
    let meta: Value =
        serde_json::from_str(&meta_raw).unwrap_or_else(|_| Value::Object(Map::default()));
    let formatter = Formatter::new(chalk);
    let header = format_header(&meta, &formatter, chalk);
    let hint = formatter.hint("(these are details from the last command that provided them)");
    Ok(format!("{header}\n\n{content}\n\n{hint}"))
}

fn format_header(meta: &Value, formatter: &Formatter, chalk: Chalk) -> String {
    let timestamp = meta["timestamp"]
        .as_str()
        .filter(|ts| !ts.is_empty() && chrono::DateTime::parse_from_rfc3339(ts).is_ok());
    if let Some(command) = meta["command"]
        .as_str()
        .filter(|cmd| !cmd.is_empty())
    {
        let title = formatter.title(&format!(r#"details from "bit {command}""#));
        match timestamp {
            Some(ts) => format!("{title}{}", chalk.dim(&format!("  {ts}"))),
            None => title,
        }
    } else {
        formatter.title("details from last command")
    }
}

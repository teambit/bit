//! Native `bit schema <pattern>` (`scopes/semantics/schema/schema.cmd.ts`, alias `api`).

mod extractor;
#[cfg(test)]
mod tests;

use self::extractor::{
    WorkspaceSchemaOutcome, resolve_scope_schema_json, resolve_workspace_schema,
};
use super::{
    Command,
    lane::scope_root,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "schema", aliases: &["api"], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: String,
    pub remote: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("schema arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native schema grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI schema delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_missing_host(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "schema", |_| {
            Err(io::Error::other(HOST_NOT_FOUND_ERR))
        });
    }
    if !options.remote
        && let Some(outcome) = try_run_local(&cwd, args, &options)?
    {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("schema extraction delegated".into()))
}

fn try_run_local(cwd: &Path, args: &[OsString], options: &Options) -> io::Result<Option<Outcome>> {
    if let Some(root) = workspace::root(cwd) {
        return match resolve_workspace_schema(&root, &options.pattern, options.json) {
            WorkspaceSchemaOutcome::Empty if options.json => {
                workspace_command::execute_json(&root, args, "schema", |_| {
                    Ok(Report { data: "[]".into(), code: 0, details: None })
                })
                .map(Some)
            }
            WorkspaceSchemaOutcome::Empty => {
                workspace_command::execute_then(&root, args, "schema", |_| {
                    Ok(Report { data: String::new(), code: 0, details: None })
                })
                .map(Some)
            }
            WorkspaceSchemaOutcome::Schemas(schemas) => {
                let data = serde_json::to_string_pretty(&schemas).map_err(io::Error::other)?;
                workspace_command::execute_json(&root, args, "schema", |_| {
                    Ok(Report { data, code: 0, details: None })
                })
                .map(Some)
            }
            WorkspaceSchemaOutcome::Declined => Ok(None),
        };
    }
    if options.json
        && let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
        && let Some(schemas) = resolve_scope_schema_json(&scope.path, &options.pattern)
    {
        let data = serde_json::to_string_pretty(&schemas).map_err(io::Error::other)?;
        let mut stdout = io::stdout().lock();
        stdout.write_all(data.as_bytes())?;
        stdout.flush()?;
        return Ok(Some(Outcome::Exit(ExitCode::SUCCESS)));
    }
    Ok(None)
}

pub(super) fn is_missing_host(cwd: &Path, options: &Options) -> bool {
    !options.remote
        && workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut remote = false;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-r" | "--remote" => remote = true,
            "--no-remote" => remote = false,
            "-j" | "--json" => json = true,
            "--no-json" => json = false,
            val if !val.starts_with('-') && !val.is_empty() && pattern.is_none() => {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, remote, json })
}

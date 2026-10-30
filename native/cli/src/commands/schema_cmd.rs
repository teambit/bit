//! Native `bit schema <pattern>` (`scopes/semantics/schema/schema.cmd.ts`, alias `api`).

mod extractor;
#[cfg(test)]
mod tests;

use self::extractor::{
    WorkspaceSchemaOutcome, diagnose_scope_schema_error, diagnose_workspace_diff_error,
    resolve_scope_schema_json, resolve_workspace_schema,
};
use super::{
    Command,
    color::Chalk,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DiffOptions {
    pub component: String,
    pub base_version: String,
    pub compare_version: String,
    pub json: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum ParsedCommand {
    Schema(Options),
    Diff(DiffOptions),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("schema arguments are not UTF-8".into()));
    };
    let Some(parsed) = parse_command(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native schema grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI schema delegated".into()));
    }
    let cwd = env::current_dir()?;
    match parsed {
        ParsedCommand::Diff(diff_opts) => run_diff(&cwd, args, &diff_opts),
        ParsedCommand::Schema(options) => {
            if is_missing_host(&cwd, &options) {
                return workspace_command::execute_failure_scope(
                    &cwd,
                    args,
                    "schema",
                    options.json,
                    "",
                    io::Error::other(HOST_NOT_FOUND_ERR),
                );
            }
            if !options.remote
                && let Some(outcome) = try_run_local(&cwd, args, &options)?
            {
                return Ok(outcome);
            }
            Ok(Outcome::Declined("schema extraction delegated".into()))
        }
    }
}

fn run_diff(cwd: &Path, args: &[OsString], opts: &DiffOptions) -> io::Result<Outcome> {
    if is_outside_any_host(cwd) {
        return workspace_command::execute_failure_scope(
            cwd,
            args,
            "diff",
            opts.json,
            "",
            io::Error::other(HOST_NOT_FOUND_ERR),
        );
    }
    if let Some(root) = workspace::root(cwd) {
        if let Some(err) =
            diagnose_workspace_diff_error(&root, &opts.component, Chalk::detect(args))
        {
            return emit_workspace_error(&root, args, "diff", opts.json, err);
        }
        return Ok(Outcome::Declined("schema diff delegated".into()));
    }
    if let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
        && let Some(err) = diagnose_scope_schema_error(&scope.path, &opts.component)
    {
        return workspace_command::execute_failure_scope(
            &scope.path,
            args,
            "diff",
            opts.json,
            "",
            io::Error::other(err),
        );
    }
    Ok(Outcome::Declined("schema diff delegated".into()))
}

fn try_run_local(cwd: &Path, args: &[OsString], options: &Options) -> io::Result<Option<Outcome>> {
    if let Some(root) = workspace::root(cwd) {
        return match resolve_workspace_schema(
            &root,
            &options.pattern,
            options.json,
            Chalk::detect(args),
        ) {
            WorkspaceSchemaOutcome::Error(err) => {
                emit_workspace_error(&root, args, "schema", options.json, err).map(Some)
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
    if let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
    {
        return try_run_bare_scope(&scope.path, args, options);
    }
    Ok(None)
}

fn try_run_bare_scope(
    scope_dir: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if options.json
        && let Some(schemas) = resolve_scope_schema_json(scope_dir, &options.pattern)
    {
        let data = serde_json::to_string_pretty(&schemas).map_err(io::Error::other)?;
        let mut stdout = io::stdout().lock();
        stdout.write_all(data.as_bytes())?;
        stdout.flush()?;
        return Ok(Some(Outcome::Exit(ExitCode::SUCCESS)));
    }
    if let Some(err) = diagnose_scope_schema_error(scope_dir, &options.pattern) {
        return workspace_command::execute_failure_scope(
            scope_dir,
            args,
            "schema",
            options.json,
            "",
            io::Error::other(err),
        )
        .map(Some);
    }
    Ok(None)
}

fn emit_workspace_error(
    root: &Path,
    args: &[OsString],
    command: &str,
    json: bool,
    err: String,
) -> io::Result<Outcome> {
    if json {
        workspace_command::execute_json(root, args, command, |_| Err(io::Error::other(err)))
    } else {
        workspace_command::execute_then(root, args, command, |_| Err(io::Error::other(err)))
    }
}

pub(super) fn is_missing_host(cwd: &Path, options: &Options) -> bool {
    !options.remote && is_outside_any_host(cwd)
}

fn is_outside_any_host(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| dir.join("scope.json").is_file() || dir.join(".bit").is_dir())
}

pub(super) fn parse_command(args: &[&str]) -> Option<ParsedCommand> {
    if args
        .iter()
        .find(|arg| !arg.starts_with('-'))
        == Some(&"diff")
    {
        return parse_diff_options(args).map(ParsedCommand::Diff);
    }
    parse_options(args).map(ParsedCommand::Schema)
}

fn parse_diff_options(args: &[&str]) -> Option<DiffOptions> {
    let mut positional = Vec::new();
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            val if !val.starts_with('-') && !val.is_empty() => positional.push(val),
            _ => return None,
        }
    }
    let ["diff", component, base_version, compare_version] = positional.as_slice() else {
        return None;
    };
    Some(DiffOptions {
        component: (*component).to_owned(),
        base_version: (*base_version).to_owned(),
        compare_version: (*compare_version).to_owned(),
        json,
    })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut pattern = None;
    let mut remote = false;
    let mut json = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-r" | "--remote" | "--remote=true" => remote = true,
            "--remote=false" => remote = false,
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-rj" | "-jr" => {
                remote = true;
                json = true;
            }
            val if !val.starts_with('-')
                && !val.is_empty()
                && val != "diff"
                && pattern.is_none() =>
            {
                pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, remote, json })
}

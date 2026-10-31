//! Native `bit ws-config <sub-command>` (`bit workspace-config`) (`scopes/workspace/workspace-config-files/ws-config.cmd.ts`).

pub(super) use self::clean::collect_standard_env_ids;

mod clean;
mod format;
#[cfg(test)]
mod tests;
mod write;

use self::{
    clean::{
        clean_workspace_configs, collect_active_component_dirs, format_clean_output,
        format_list_json, format_list_output,
    },
    format::format_write_output,
    write::write_workspace_configs,
};
use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    script::resolve_workspace_components,
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

pub const COMMAND: Command = Command { name: "ws-config", aliases: &["workspace-config"], run };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct WriteOptions {
    pub clean: bool,
    pub writers: Option<Vec<String>>,
    pub no_dedupe: bool,
    pub dry_run: DryRunMode,
    pub verbose: bool,
    pub silent: bool,
    pub force: bool,
    pub json: bool,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(super) enum DryRunMode {
    #[default]
    Off,
    PathsOnly,
    WithContent,
}

impl DryRunMode {
    pub const fn is_dry(self) -> bool {
        !matches!(self, Self::Off)
    }

    pub const fn with_content(self) -> bool {
        matches!(self, Self::WithContent)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Unrecognized(String),
    List { json: bool },
    Clean { silent: bool, dry_run: bool, writers: Option<Vec<String>>, json: bool },
    Write(WriteOptions),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ws-config arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native ws-config grammar".into()));
    };
    let chalk = Chalk::detect(args);
    match subcommand {
        Subcommand::Unrecognized(sub) => run_unrecognized(args, &sub, chalk),
        Subcommand::List { json } => run_list(args, json, chalk),
        Subcommand::Clean { silent, dry_run, writers, json } => {
            run_clean(args, silent, dry_run, writers.as_deref(), json)
        }
        Subcommand::Write(opts) => run_write(args, &opts, chalk),
    }
}

fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "ws-config", please run "bit ws-config --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "ws-config", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "ws-config", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

fn emit_outside_workspace(
    cwd: &Path,
    args: &[OsString],
    subcommand: &str,
    json_flag: bool,
) -> io::Result<Outcome> {
    let err =
        io::Error::other("workspace not found. to initiate a new workspace, please use `bit init`");
    workspace_command::execute_failure_scope(cwd, args, subcommand, json_flag, "", err)
}

fn run_list(args: &[OsString], json_flag: bool, chalk: Chalk) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ws-config list delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return emit_outside_workspace(&cwd, args, "list", json_flag);
    };
    let Ok((_, ws)) = resolve_workspace_components(&root) else {
        return Ok(Outcome::Declined("ws-config list workspace resolution delegated".into()));
    };
    let Some(env_ids) = collect_standard_env_ids(&ws) else {
        return Ok(Outcome::Declined("ws-config list non-standard env delegated".into()));
    };
    if json_flag {
        let data = format_list_json(&env_ids)?;
        return workspace_command::execute_json(&root, args, "list", |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let data = format_list_output(&env_ids, chalk);
    workspace_command::execute_then(&root, args, "list", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

fn run_clean(
    args: &[OsString],
    silent: bool,
    dry_run: bool,
    writers: Option<&[String]>,
    json_flag: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("ws-config clean CI delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return emit_outside_workspace(&cwd, args, "clean", json_flag);
    };
    if !silent && !dry_run {
        return Ok(Outcome::Declined("ws-config clean interactive delegated".into()));
    }
    let Ok((_, ws)) = resolve_workspace_components(&root) else {
        return Ok(Outcome::Declined("ws-config clean workspace resolution delegated".into()));
    };
    let Some(env_ids) = collect_standard_env_ids(&ws) else {
        return Ok(Outcome::Declined("ws-config clean non-standard env delegated".into()));
    };
    let paths = if env_ids.is_empty() {
        Vec::new()
    } else {
        clean_workspace_configs(&root, writers, dry_run)?
    };
    if json_flag {
        let data = serde_json::to_string_pretty(&paths).map_err(io::Error::other)?;
        return workspace_command::execute_json(&root, args, "clean", |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let chalk = Chalk::detect(args);
    let data = format_clean_output(&paths, dry_run, chalk);
    workspace_command::execute_then(&root, args, "clean", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

fn run_write(args: &[OsString], opts: &WriteOptions, chalk: Chalk) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ws-config write delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return emit_outside_workspace(&cwd, args, "write", opts.json);
    };
    let Ok((_, ws)) = resolve_workspace_components(&root) else {
        return Ok(Outcome::Declined("ws-config write workspace resolution delegated".into()));
    };
    let Some(env_ids) = collect_standard_env_ids(&ws) else {
        return Ok(Outcome::Declined("ws-config write non-standard env delegated".into()));
    };
    if opts.dry_run.with_content() && !opts.json {
        return workspace_command::execute_then(&root, args, "write", |_| {
            Err(io::Error::other("use --json flag along with --dry-run-with-content"))
        });
    }
    let comp_dirs = collect_active_component_dirs(&ws);
    let result = write_workspace_configs(&root, &env_ids, &comp_dirs, opts)?;
    if opts.json {
        let data = serde_json::to_string_pretty(&result).map_err(io::Error::other)?;
        return workspace_command::execute_json(&root, args, "write", |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let data = format_write_output(&result, opts, chalk);
    workspace_command::execute_then(&root, args, "write", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    if let Some(sub) = parse_unrecognized(args) {
        return Some(Subcommand::Unrecognized(sub.to_owned()));
    }
    let filtered: Vec<_> = args
        .iter()
        .copied()
        .filter(|&arg| !matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect();
    let rest = filtered.get(1..)?;
    let rest = rest
        .strip_suffix(&["--"])
        .unwrap_or(rest);
    if rest.contains(&"--") {
        return None;
    }
    match *filtered.first()? {
        "list" => parse_list(rest),
        "clean" => parse_clean(rest),
        "write" => parse_write(rest),
        _ => None,
    }
}

pub(super) fn parse_unrecognized<'a>(args: &[&'a str]) -> Option<&'a str> {
    let filtered: Vec<_> = args
        .iter()
        .copied()
        .filter(|&arg| !matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect();
    let [sub] = filtered.as_slice() else { return None };
    (!sub.starts_with('-') && !matches!(*sub, "write" | "clean" | "list")).then_some(*sub)
}

fn parse_list(rest: &[&str]) -> Option<Subcommand> {
    let mut json = false;
    for &arg in rest {
        match arg {
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => return None,
        }
    }
    Some(Subcommand::List { json })
}

fn parse_clean(rest: &[&str]) -> Option<Subcommand> {
    let (mut silent, mut dry_run, mut writers, mut json, mut idx) = (false, false, None, false, 0);
    while idx < rest.len() {
        match rest[idx] {
            "-s" | "--silent" | "--silent=true" => silent = true,
            "--silent=false" => silent = false,
            "--dry-run" | "--dry-run=true" => dry_run = true,
            "--dry-run=false" => dry_run = false,
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-sj" | "-js" => (silent, json) = (true, true),
            _ => writers = Some(parse_writers_arg(rest, &mut idx)?),
        }
        idx += 1;
    }
    Some(Subcommand::Clean { silent, dry_run, writers, json })
}

fn parse_write(rest: &[&str]) -> Option<Subcommand> {
    let mut opts = WriteOptions::default();
    let mut idx = 0usize;
    while idx < rest.len() {
        if !apply_write_flag(rest[idx], &mut opts) {
            opts.writers = Some(parse_writers_arg(rest, &mut idx)?);
        }
        idx += 1;
    }
    Some(Subcommand::Write(opts))
}

fn apply_write_flag(token: &str, opts: &mut WriteOptions) -> bool {
    if apply_write_combined_short(token, opts) || apply_write_bool(token, opts) {
        return true;
    }
    match token {
        "--dry-run" | "--dry-run=true" if opts.dry_run == DryRunMode::Off => {
            opts.dry_run = DryRunMode::PathsOnly;
        }
        "--dry-run" | "--dry-run=true" | "--dry-run=false" | "--dry-run-with-content=false" => {
            if token == "--dry-run=false" && opts.dry_run == DryRunMode::PathsOnly
                || token == "--dry-run-with-content=false"
                    && opts.dry_run == DryRunMode::WithContent
            {
                opts.dry_run = DryRunMode::Off;
            }
        }
        "--dry-run-with-content" | "--dry-run-with-content=true" => {
            opts.dry_run = DryRunMode::WithContent;
        }
        _ => return false,
    }
    true
}

fn apply_write_bool(token: &str, opts: &mut WriteOptions) -> bool {
    let (flag, val) = match token.split_once('=') {
        Some((flag, "true")) => (flag, true),
        Some((flag, "false")) => (flag, false),
        None => (token, true),
        _ => return false,
    };
    if !val && !token.starts_with("--") {
        return false;
    }
    let slot = match flag {
        "-c" | "--clean" => &mut opts.clean,
        "-n" | "--no-dedupe" => &mut opts.no_dedupe,
        "-v" | "--verbose" => &mut opts.verbose,
        "-s" | "--silent" => &mut opts.silent,
        "-f" | "--force" => &mut opts.force,
        "-j" | "--json" => &mut opts.json,
        _ => return false,
    };
    *slot = val;
    true
}

fn apply_write_combined_short(token: &str, opts: &mut WriteOptions) -> bool {
    if !token.starts_with('-')
        || token.starts_with("--")
        || token.len() <= 2
        || !token[1..]
            .bytes()
            .all(|byte| matches!(byte, b'c' | b'n' | b'v' | b's' | b'f' | b'j'))
    {
        return false;
    }
    for byte in token[1..].bytes() {
        match byte {
            b'c' => opts.clean = true,
            b'n' => opts.no_dedupe = true,
            b'v' => opts.verbose = true,
            b's' => opts.silent = true,
            b'f' => opts.force = true,
            _ => opts.json = true,
        }
    }
    true
}

fn parse_writers_arg(rest: &[&str], idx: &mut usize) -> Option<Vec<String>> {
    match rest[*idx] {
        "-w" | "--writers" => {
            *idx += 1;
            split_writers(rest.get(*idx)?)
        }
        arg => split_writers(
            arg.strip_prefix("--writers=")
                .or_else(|| arg.strip_prefix("-w="))?,
        ),
    }
}

fn split_writers(raw: &str) -> Option<Vec<String>> {
    let raw = raw.trim();
    (!raw.is_empty() && !raw.starts_with('-'))
        .then(|| {
            raw.split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .filter(|writers: &Vec<String>| !writers.is_empty())
}

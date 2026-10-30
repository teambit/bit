//! Native `bit ws-config <sub-command>` (`bit workspace-config`) (`scopes/workspace/workspace-config-files/ws-config.cmd.ts`).

mod clean;
mod format;
#[cfg(test)]
mod tests;
mod write;

use self::{
    clean::{clean_workspace_configs, format_clean_output, format_list_json, format_list_output},
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
use bit_install::{config::aspect_id_without_version, workspace::Workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "ws-config", aliases: &["workspace-config"], run };

const STANDARD_WRITER_ENVS: &[&str] = &[
    "teambit.harmony/node",
    "teambit.react/react",
    "teambit.harmony/aspect",
    "teambit.envs/env",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
];

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

pub(super) fn collect_standard_env_ids(ws: &Workspace) -> Option<Vec<String>> {
    let mut env_ids = Vec::new();
    for (_, comp) in ws.active() {
        let bare = aspect_id_without_version(&comp.env_id);
        if !STANDARD_WRITER_ENVS.contains(&bare) {
            return None;
        }
        if !env_ids
            .iter()
            .any(|existing| existing == bare)
        {
            env_ids.push(bare.to_owned());
        }
    }
    Some(env_ids)
}

fn collect_active_component_dirs(ws: &Workspace) -> Vec<String> {
    ws.active()
        .map(|(_, comp)| comp.root_dir.clone())
        .filter(|dir| !dir.is_empty())
        .collect()
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    if let Some(sub) = parse_unrecognized(args) {
        return Some(Subcommand::Unrecognized(sub.to_owned()));
    }
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["list", rest @ ..] => parse_list(rest),
        ["clean", rest @ ..] => parse_clean(rest),
        ["write", rest @ ..] => parse_write(rest),
        _ => None,
    }
}

pub(super) fn parse_unrecognized<'a>(args: &[&'a str]) -> Option<&'a str> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    let [sub] = filtered.as_slice() else {
        return None;
    };
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
    let mut silent = false;
    let mut dry_run = false;
    let mut writers = None;
    let mut json = false;
    let mut idx = 0usize;
    while idx < rest.len() {
        match rest[idx] {
            "-s" | "--silent" | "--silent=true" => silent = true,
            "--silent=false" => silent = false,
            "--dry-run" | "--dry-run=true" => dry_run = true,
            "--dry-run=false" => dry_run = false,
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-w" | "--writers" => {
                idx += 1;
                writers = Some(split_writers(rest.get(idx)?)?);
            }
            arg if let Some(val) = arg
                .strip_prefix("--writers=")
                .or_else(|| arg.strip_prefix("-w=")) =>
            {
                writers = Some(split_writers(val)?);
            }
            _ => return None,
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
            apply_write_value_flag(rest, &mut idx, &mut opts)?;
        }
        idx += 1;
    }
    Some(Subcommand::Write(opts))
}

fn apply_write_flag(token: &str, opts: &mut WriteOptions) -> bool {
    match token {
        "-c" | "--clean" | "--clean=true" => opts.clean = true,
        "--clean=false" => opts.clean = false,
        "-n" | "--no-dedupe" | "--no-dedupe=true" => opts.no_dedupe = true,
        "--no-dedupe=false" => opts.no_dedupe = false,
        "--dry-run" | "--dry-run=true" => {
            if opts.dry_run == DryRunMode::Off {
                opts.dry_run = DryRunMode::PathsOnly;
            }
        }
        "--dry-run=false" => {
            if opts.dry_run == DryRunMode::PathsOnly {
                opts.dry_run = DryRunMode::Off;
            }
        }
        "--dry-run-with-content" | "--dry-run-with-content=true" => {
            opts.dry_run = DryRunMode::WithContent;
        }
        "--dry-run-with-content=false" => {
            if opts.dry_run == DryRunMode::WithContent {
                opts.dry_run = DryRunMode::Off;
            }
        }
        "-v" | "--verbose" | "--verbose=true" => opts.verbose = true,
        "--verbose=false" => opts.verbose = false,
        "-s" | "--silent" | "--silent=true" => opts.silent = true,
        "--silent=false" => opts.silent = false,
        "-f" | "--force" | "--force=true" => opts.force = true,
        "--force=false" => opts.force = false,
        "-j" | "--json" | "--json=true" => opts.json = true,
        "--json=false" => opts.json = false,
        _ => return false,
    }
    true
}

fn apply_write_value_flag(rest: &[&str], idx: &mut usize, opts: &mut WriteOptions) -> Option<()> {
    match rest[*idx] {
        "-w" | "--writers" => {
            *idx += 1;
            opts.writers = Some(split_writers(rest.get(*idx)?)?);
        }
        arg if let Some(val) = arg
            .strip_prefix("--writers=")
            .or_else(|| arg.strip_prefix("-w=")) =>
        {
            opts.writers = Some(split_writers(val)?);
        }
        _ => return None,
    }
    Some(())
}

fn split_writers(raw: &str) -> Option<Vec<String>> {
    if raw.is_empty() || raw.starts_with('-') {
        return None;
    }
    Some(
        raw.split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect(),
    )
}

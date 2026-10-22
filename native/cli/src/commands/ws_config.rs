//! Native `bit ws-config <sub-command>` (`bit workspace-config`) (`scopes/workspace/workspace-config-files/ws-config.cmd.ts`).

#[cfg(test)]
mod tests;

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
    fs,
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

const STANDARD_WRITERS: &[(&str, &str, &str)] = &[
    ("typescript", "tsconfig.json", "// bit-generated-typescript-config"),
    ("eslint", ".eslintrc.json", "// bit-generated-eslint-config"),
    ("prettier", ".prettierrc.cjs", "// bit-generated-prettier-config"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Unrecognized(String),
    List { json: bool },
    Clean { silent: bool, dry_run: bool, writers: Option<Vec<String>>, json: bool },
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

fn run_list(args: &[OsString], json_flag: bool, chalk: Chalk) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ws-config list delegated".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("ws-config list requires a workspace".into()));
    };
    let Ok((_, ws)) = resolve_workspace_components(&root) else {
        return Ok(Outcome::Declined("ws-config list workspace resolution delegated".into()));
    };
    let Some(env_ids) = collect_standard_env_ids(&ws) else {
        return Ok(Outcome::Declined("ws-config list non-standard env delegated".into()));
    };
    if json_flag {
        if !env_ids.is_empty() {
            return Ok(Outcome::Declined("ws-config list --json with envs delegated".into()));
        }
        return workspace_command::execute_json(&root, args, "list", |_| {
            Ok(Report { data: "[]".into(), code: 0, details: None })
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
    if (!silent && !dry_run) || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("ws-config clean interactive/CI delegated".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("ws-config clean requires a workspace".into()));
    };
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

pub(super) fn format_list_output(env_ids: &[String], chalk: Chalk) -> String {
    env_ids
        .iter()
        .map(|env_id| {
            format!(
                "{}\n  TypescriptConfigWriter (typescript)\n  EslintConfigWriter (eslint)\n  PrettierConfigWriter (prettier)",
                chalk.bold(env_id),
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(super) fn format_clean_output(paths: &[String], dry_run: bool, chalk: Chalk) -> String {
    let verb = if dry_run { "will be" } else { "were" };
    let header = chalk.green(&format!("{} config files {verb} deleted", paths.len()));
    format!("{header}\n  {}\n", paths.join("\n  "))
}

pub(super) fn clean_workspace_configs(
    root: &Path,
    writers: Option<&[String]>,
    dry_run: bool,
) -> io::Result<Vec<String>> {
    let mut found_by_writer: Vec<Vec<String>> = vec![Vec::new(); STANDARD_WRITERS.len()];
    scan_config_dir(root, root, writers, &mut found_by_writer)?;
    let mut paths = Vec::new();
    for writer_paths in found_by_writer {
        append_writer_paths(root, writer_paths, dry_run, &mut paths);
    }
    Ok(paths)
}

fn append_writer_paths(
    root: &Path,
    mut writer_paths: Vec<String>,
    dry_run: bool,
    paths: &mut Vec<String>,
) {
    writer_paths.sort();
    for rel_path in writer_paths {
        if !paths.contains(&rel_path) {
            if !dry_run {
                let _ = fs::remove_file(root.join(&rel_path));
            }
            paths.push(rel_path);
        }
    }
}

fn scan_config_dir(
    root: &Path,
    dir: &Path,
    writers: Option<&[String]>,
    found_by_writer: &mut [Vec<String>],
) -> io::Result<()> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry_res in read_dir {
        let entry = entry_res?;
        let file_name = entry.file_name();
        let Some(name_str) = file_name.to_str() else {
            continue;
        };
        if matches!(name_str, "node_modules" | ".git" | ".bit") {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            scan_config_dir(root, &path, writers, found_by_writer)?;
        } else if path.is_file() {
            check_config_file(root, &path, name_str, writers, found_by_writer);
        }
    }
    Ok(())
}

fn check_config_file(
    root: &Path,
    path: &Path,
    name_str: &str,
    writers: Option<&[String]>,
    found_by_writer: &mut [Vec<String>],
) {
    for (idx, &(writer_id, target_file, marker)) in STANDARD_WRITERS.iter().enumerate() {
        if name_str != target_file {
            continue;
        }
        if let Some(filter) = writers
            && !filter
                .iter()
                .any(|item| item == writer_id)
        {
            continue;
        }
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        if content.contains(marker)
            && let Ok(rel) = path.strip_prefix(root)
        {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            found_by_writer[idx].push(rel_str);
        }
    }
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
            "-j" | "--json" => json = true,
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
            "-s" | "--silent" => silent = true,
            "--dry-run" => dry_run = true,
            "-j" | "--json" => json = true,
            "-w" | "--writers" => {
                idx += 1;
                writers = Some(split_writers(rest.get(idx)?)?);
            }
            arg if let Some(val) = arg.strip_prefix("--writers=") => {
                writers = Some(split_writers(val)?);
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(Subcommand::Clean { silent, dry_run, writers, json })
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

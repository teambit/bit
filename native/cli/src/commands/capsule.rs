//! Native `bit capsule [list|delete|create]` (`scopes/workspace/workspace/capsule.cmd.ts`).

mod create;
mod list_stats;
mod prune;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    globals::resolve_capsules_dir,
    lane::scope_root::{self, ScopeRoot},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use bit_workspace_config::{
    cache_root, environment_value, global_config_dir, merge_layers, parse_jsonc,
    read_global_config, workspace_values,
};
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use std::{
    env,
    ffi::OsString,
    fmt::Write as _,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "capsule", aliases: &[], run };

const BUILD_BASE_KEY: &str = "capsules_build_components_base_dir";
const SCOPE_ASPECTS_BASE_KEY: &str = "capsules_scopes_aspects_base_dir";
const GLOBAL_SCOPE_ASPECTS_BASE_KEY: &str = "capsules_global_scope_aspects_base_dir";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    BareList,
    List { json: bool, with_stats: bool },
    Prune(prune::PruneArgs),
    Delete { all: bool, scope_aspects: bool },
    Create(create::CreateArgs),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CapsuleRootDirs {
    pub workspace: Option<String>,
    pub scope_aspects: String,
    pub scope: Option<String>,
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::BareList => "capsule",
            Self::List { .. } => "list",
            Self::Prune(_) => "prune",
            Self::Delete { .. } => "delete",
            Self::Create(_) => "create",
        }
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("capsule arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native capsule grammar".into()));
    };
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let root = match scope_root::discover() {
        Ok(Some(root)) => root,
        Ok(None) if matches!(subcommand, Subcommand::Delete { all: true, .. }) => {
            return run_delete_all_outside_scope(&cwd, args, chalk);
        }
        _ => return Ok(Outcome::Declined("capsule requires a workspace or scope".into())),
    };
    match &subcommand {
        Subcommand::Prune(prune_args) => prune::run(&cwd, &root, args, chalk, prune_args),
        Subcommand::List { json: true, with_stats } => {
            run_list_json(&cwd, &root, args, *with_stats)
        }
        Subcommand::BareList | Subcommand::List { json: false, .. } => {
            let with_stats = matches!(subcommand, Subcommand::List { with_stats: true, .. });
            let Ok(data) = build_list_report(&cwd, &root, chalk, with_stats) else {
                return Ok(Outcome::Declined("capsule list delegated".into()));
            };
            emit_report(&root, args, subcommand.loader_label(), data)
        }
        Subcommand::Delete { all, scope_aspects } => {
            run_delete(&cwd, &root, args, chalk, subcommand.loader_label(), *all, *scope_aspects)
        }
        Subcommand::Create(create_args) => {
            create::run_create(&cwd, &root, args, chalk, create_args)
        }
    }
}

fn run_delete_all_outside_scope(
    cwd: &Path,
    args: &[OsString],
    chalk: Chalk,
) -> io::Result<Outcome> {
    let Ok(target_dir) = resolve_capsules_dir(cwd) else {
        return Ok(Outcome::Declined("capsule delete --all cache root delegated".into()));
    };
    let report = delete_and_report(&target_dir, chalk)?;
    workspace_command::execute_with_scope(cwd, args, "delete", &report)
}

fn run_list_json(
    cwd: &Path,
    root: &ScopeRoot,
    args: &[OsString],
    with_stats: bool,
) -> io::Result<Outcome> {
    let Ok(payload) = build_list_json(cwd, root, with_stats) else {
        return Ok(Outcome::Declined("capsule list --json delegated".into()));
    };
    let history = (!root.bare).then(|| History::start(&root.path, args));
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&payload)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn run_delete(
    cwd: &Path,
    root: &ScopeRoot,
    args: &[OsString],
    chalk: Chalk,
    label: &'static str,
    all: bool,
    scope_aspects: bool,
) -> io::Result<Outcome> {
    let Ok(target_dir) = resolve_delete_dir(cwd, root, all, scope_aspects) else {
        return Ok(Outcome::Declined("capsule delete delegated".into()));
    };
    if root.bare {
        let report = delete_and_report(&target_dir, chalk)?;
        workspace_command::execute_with_scope(&root.path, args, label, &report)
    } else {
        workspace_command::execute_then(&root.path, args, label, |_| {
            delete_and_report(&target_dir, chalk)
        })
    }
}

fn emit_report(
    root: &ScopeRoot,
    args: &[OsString],
    label: &'static str,
    data: String,
) -> io::Result<Outcome> {
    let report = Report { data, code: 0, details: None };
    if root.bare {
        workspace_command::execute_with_scope(&root.path, args, label, &report)
    } else {
        workspace_command::execute_then(&root.path, args, label, |_| Ok(report))
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        [] => Some(Subcommand::BareList),
        ["list", rest @ ..] => parse_list_flags(rest),
        ["delete", rest @ ..] => parse_delete_flags(rest),
        ["prune", rest @ ..] => prune::parse_flags(rest).map(Subcommand::Prune),
        ["create", rest @ ..] => create::parse_create_flags(rest),
        _ => None,
    }
}

fn parse_list_flags(rest: &[&str]) -> Option<Subcommand> {
    let mut json = false;
    let mut with_stats = false;
    for &arg in rest {
        match arg {
            "-j" | "--json" => json = true,
            "--with-stats" => with_stats = true,
            _ => return None,
        }
    }
    Some(Subcommand::List { json, with_stats })
}

fn parse_delete_flags(rest: &[&str]) -> Option<Subcommand> {
    let mut all = false;
    let mut scope_aspects = false;
    for &arg in rest {
        match arg {
            "-a" | "--all" => all = true,
            "--scope-aspects" => scope_aspects = true,
            _ => return None,
        }
    }
    Some(Subcommand::Delete { all, scope_aspects })
}

fn build_list_report(
    cwd: &Path,
    root: &ScopeRoot,
    chalk: Chalk,
    with_stats: bool,
) -> io::Result<String> {
    let dirs = compute_capsules_root_dirs(cwd, root)?;
    let list_ws = dirs.workspace.as_deref().map(list_capsules_in_dir);
    let list_scope = list_capsules_in_dir(&dirs.scope_aspects);
    let num_capsules = list_ws.as_ref().map_or(list_scope.len(), Vec::len);
    let host_type = if root.bare { "scope" } else { "workspace" };
    let host_path = root.path.to_string_lossy();
    let formatter = Formatter::new(chalk);
    let mut lines = vec![formatter.title(&format!(
        "found {num_capsules} capsule(s) for {host_type}: {host_path}",
    ))];
    if let Some(ws_dir) = &dirs.workspace {
        lines.push(formatter.item(&format!("workspace capsules root-dir: {ws_dir}")));
    }
    lines.push(formatter.item(&format!(
        "scope's aspects capsules root-dir: {}",
        dirs.scope_aspects,
    )));
    if let Some(scope_dir) = &dirs.scope {
        lines.push(formatter.item(&format!("scope's capsules root-dir: {scope_dir}")));
    }
    if with_stats {
        let stats = list_stats::collect(cwd, true)?;
        let age_days = list_stats::max_age_days(&read_combined_config(root)?);
        lines.push(formatter.item(&list_stats::summary(&stats, age_days, chalk)));
        lines.push(formatter.hint("use --json to get the list of all capsules"));
    } else {
        lines.push(formatter.hint(
            "use --json to get the list of all capsules, or --with-stats for size/orphan summary",
        ));
    }
    Ok(lines.join("\n"))
}

fn build_list_json(cwd: &Path, root: &ScopeRoot, with_stats: bool) -> io::Result<Value> {
    let dirs = compute_capsules_root_dirs(cwd, root)?;
    let capsules = dirs.workspace.as_deref().map_or_else(Vec::new, list_capsules_in_dir);
    let scope_capsules = list_capsules_in_dir(&dirs.scope_aspects);
    let mut out = Map::new();
    if let Some(ws_dir) = dirs.workspace {
        out.insert("workspaceCapsulesRootDir".into(), Value::String(ws_dir));
    }
    out.insert("scopeAspectsCapsulesRootDir".into(), Value::String(dirs.scope_aspects));
    if let Some(scope_dir) = dirs.scope {
        out.insert("scopeCapsulesRootDir".into(), Value::String(scope_dir));
    }
    out.insert("capsules".into(), json!(capsules));
    out.insert("scopeCapsules".into(), json!(scope_capsules));
    if with_stats {
        let stats = list_stats::collect(cwd, true)?;
        out.insert("totalSizeBytes".into(), json!(list_stats::total_size(&stats)));
        out.insert("allRoots".into(), json!(stats));
    }
    Ok(Value::Object(out))
}

fn resolve_delete_dir(
    cwd: &Path,
    root: &ScopeRoot,
    all: bool,
    scope_aspects: bool,
) -> io::Result<String> {
    if !all && scope_aspects {
        let dirs = compute_capsules_root_dirs(cwd, root)?;
        return Ok(dirs.scope_aspects);
    }
    resolve_capsules_dir(cwd)
}

fn delete_and_report(target_dir: &str, chalk: Chalk) -> io::Result<Report> {
    if Path::new(target_dir).exists() {
        fs::remove_dir_all(target_dir)?;
    }
    let formatter = Formatter::new(chalk);
    let data = formatter.success_summary(&format!(
        "capsules dir has been deleted: {}",
        chalk.bold(target_dir),
    ));
    Ok(Report { data, code: 0, details: None })
}

pub(super) fn compute_capsules_root_dirs(
    cwd: &Path,
    root: &ScopeRoot,
) -> io::Result<CapsuleRootDirs> {
    let capsules_base = resolve_capsules_dir(cwd)?;
    let combined = read_combined_config(root)?;
    let scope_dir = if root.bare { root.path.clone() } else { workspace::scope_path(&root.path) };
    let is_global_scope = scope_dir == cache_root().join("scope");
    let workspace = (!root.bare).then(|| {
        let sub = lookup_config_str(&combined, BUILD_BASE_KEY)
            .unwrap_or_else(|| object_hash_short(&root.path.to_string_lossy()));
        Path::new(&capsules_base)
            .join(sub)
            .to_string_lossy()
            .into_owned()
    });
    let aspect_key =
        if is_global_scope { GLOBAL_SCOPE_ASPECTS_BASE_KEY } else { SCOPE_ASPECTS_BASE_KEY };
    let aspect_sub = lookup_config_str(&combined, aspect_key)
        .unwrap_or_else(|| object_hash_short(&format!("{}-aspects", scope_dir.display())));
    let scope_aspects = Path::new(&capsules_base)
        .join(aspect_sub)
        .to_string_lossy()
        .into_owned();
    let scope = root.bare.then(|| {
        Path::new(&capsules_base)
            .join(object_hash_short(&cwd.to_string_lossy()))
            .to_string_lossy()
            .into_owned()
    });
    Ok(CapsuleRootDirs { workspace, scope_aspects, scope })
}

fn lookup_config_str(combined: &Map<String, Value>, key: &str) -> Option<String> {
    environment_value(key)
        .or_else(|| {
            combined
                .get(key)
                .and_then(Value::as_str)
                .filter(|val| !val.is_empty())
                .map(str::to_owned)
        })
}

fn read_combined_config(root: &ScopeRoot) -> io::Result<Map<String, Value>> {
    let global = read_global_config(&global_config_dir())?;
    let scope_dir = if root.bare { root.path.clone() } else { workspace::scope_path(&root.path) };
    let scope_layer = if scope_dir.join("scope.json").is_file() {
        let parsed: Value = serde_json::from_slice(&fs::read(scope_dir.join("scope.json"))?)
            .map_err(io::Error::other)?;
        parsed
            .get("config")
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let ws_layer = if root.bare {
        Value::Null
    } else {
        Value::Object(workspace_values(&parse_jsonc(&fs::read(root.path.join(
            "workspace.jsonc",
        ))?)?))
    };
    Ok(merge_layers(&global, &scope_layer, &ws_layer))
}

pub(super) fn object_hash_short(text: &str) -> String {
    let payload = format!("string:{}:{text}", text.encode_utf16().count());
    let digest = Sha1::digest(payload.as_bytes());
    let mut out = String::with_capacity(10);
    for byte in &digest[..5] {
        let _ = write!(out, "{byte:02x}");
    }
    out.truncate(9);
    out
}

fn list_capsules_in_dir(dir: &str) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names = entries
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name != "node_modules")
        .collect::<Vec<_>>();
    names.sort();
    names
        .into_iter()
        .map(|name| {
            Path::new(dir)
                .join(name)
                .to_string_lossy()
                .into_owned()
        })
        .collect()
}

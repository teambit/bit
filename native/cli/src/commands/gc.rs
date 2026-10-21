//! Native `bit gc` (`scopes/workspace/clear-cache/gc-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    lane::scope_root::{self, ScopeRoot},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::{self, ExitCode},
    time::{SystemTime, UNIX_EPOCH},
};

pub const COMMAND: Command = Command { name: "gc", aliases: &[], run };

const NO_SCOPE_ERR: &str = "unable to find a scope. run this command inside a workspace or a scope";
const DRY_RUN_RESTORE_ERR: &str =
    "--dry-run cannot be combined with --restore or --restore-overwrite";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub dry_run: bool,
    pub keep_versions: Option<String>,
    pub backup: bool,
    pub restore: bool,
    pub restore_overwrite: bool,
    pub verbose: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("gc arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native gc grammar".into()));
    };
    let cwd = env::current_dir()?;
    let root_opt = scope_root::discover().ok().flatten();
    if options.restore || options.restore_overwrite {
        return run_restore(&cwd, root_opt.as_ref(), args, &options);
    }
    if let Some(raw_keep) = &options.keep_versions
        && parse_keep_versions(raw_keep).is_none()
    {
        let msg = format!(r#"--keep-versions expects a non-negative integer, got "{raw_keep}""#);
        return emit_error(&cwd, root_opt.as_ref(), args, options.json, &msg);
    }
    let Some(root) = root_opt else {
        return emit_error(&cwd, None, args, options.json, NO_SCOPE_ERR);
    };
    if !root.bare && is_workspace_scope_empty(&workspace::scope_path(&root.path)) {
        return run_empty_workspace_gc(&root, args, &options);
    }
    Ok(Outcome::Declined("gc with objects delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        match args[idx] {
            "--no-color" => {}
            "-d" | "--dry-run" => opts.dry_run = true,
            "--backup" => opts.backup = true,
            "--restore" => opts.restore = true,
            "--restore-overwrite" => opts.restore_overwrite = true,
            "-v" | "--verbose" => opts.verbose = true,
            "-j" | "--json" => opts.json = true,
            "--keep-versions" => {
                idx += 1;
                opts.keep_versions = Some((*args.get(idx)?).to_owned());
            }
            arg if arg.starts_with("--keep-versions=") => {
                opts.keep_versions = Some(arg["--keep-versions=".len()..].to_owned());
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(opts)
}

pub(super) fn parse_keep_versions(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(0);
    }
    trimmed.parse::<u64>().ok()
}

fn run_restore(
    cwd: &Path,
    root_opt: Option<&ScopeRoot>,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    if options.dry_run {
        return emit_error(cwd, root_opt, args, options.json, DRY_RUN_RESTORE_ERR);
    }
    let Some(root) = root_opt else {
        return emit_error(cwd, None, args, options.json, NO_SCOPE_ERR);
    };
    let scope_dir = if root.bare { root.path.clone() } else { workspace::scope_path(&root.path) };
    match restore_deleted_objects(&scope_dir, options.restore_overwrite) {
        Ok(()) if options.json => emit_json(root, args, &json!({ "restored": true })),
        Ok(()) => {
            let chalk = Chalk::detect(args);
            let data = Formatter::new(chalk)
                .success_summary("restored the objects from the backup directory");
            emit_report(root, args, data)
        }
        Err(msg) => emit_error(cwd, Some(root), args, options.json, &msg),
    }
}

pub(super) fn restore_deleted_objects(scope_dir: &Path, overwrite: bool) -> Result<(), String> {
    let deleted_dir = scope_dir.join("deleted-objects");
    let mut candidates = find_restoring_leftovers(scope_dir);
    candidates.push("deleted-objects".into());
    let mut staged = Vec::new();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let pid = process::id();
    for dir in candidates {
        let claimed = format!("deleted-objects.restoring-{now_ms}-{pid}-{}", staged.len());
        if fs::rename(scope_dir.join(&dir), scope_dir.join(&claimed)).is_ok() {
            staged.push(claimed);
        }
    }
    if staged.is_empty() {
        return Err(format!(
            "there is nothing to restore, \"{}\" doesn't exist.\nit is only created by a garbage collection that ran with --backup",
            deleted_dir.display(),
        ));
    }
    let objects_dir = scope_dir.join("objects");
    for staging in staged {
        let src = scope_dir.join(&staging);
        if let Err(err) = copy_dir_recursive(&src, &objects_dir, overwrite) {
            if !deleted_dir.exists() {
                let _ = fs::rename(&src, &deleted_dir);
            }
            return Err(err.to_string());
        }
        let _ = fs::remove_dir_all(&src);
    }
    Ok(())
}

fn find_restoring_leftovers(scope_dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(scope_dir) else {
        return Vec::new();
    };
    let mut names = entries
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with("deleted-objects.restoring-"))
        .collect::<Vec<_>>();
    names.sort();
    names
}

fn copy_dir_recursive(src: &Path, dst: &Path, overwrite: bool) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, overwrite)?;
        } else if overwrite || !dst_path.exists() {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn is_workspace_scope_empty(scope_dir: &Path) -> bool {
    !dir_has_any_file(&scope_dir.join("objects"))
        && !dir_has_any_file(&scope_dir.join("deleted-objects"))
        && !dir_has_any_file(&scope_dir.join("stash"))
}

fn dir_has_any_file(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_file() || (path.is_dir() && dir_has_any_file(&path)) {
            return true;
        }
    }
    false
}

fn run_empty_workspace_gc(
    root: &ScopeRoot,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    if options.json {
        let payload = json!({
            "dryRun": options.dry_run,
            "backup": options.backup,
            "totalObjects": 0,
            "totalSize": 0,
            "deletedObjects": 0,
            "deletedSize": 0,
            "deletedByType": {},
            "keptVersions": 0,
            "strayFiles": 0,
            "strayFilesSize": 0,
            "backupDirSize": 0,
            "retainedDirsSize": 0,
        });
        return emit_json(root, args, &payload);
    }
    let chalk = Chalk::detect(args);
    let data = format_empty_gc_report(options.dry_run, options.backup, chalk);
    emit_report(root, args, data)
}

pub(super) fn format_empty_gc_report(dry_run: bool, backup: bool, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let header = empty_gc_header(&formatter, dry_run, backup);
    let size_line = empty_gc_size_line(&formatter, chalk, dry_run, backup);
    let kept_line = formatter.item("keeping 0 versions and everything they point at");
    format!("{header}\n{size_line}\n{kept_line}")
}

fn empty_gc_header(formatter: &Formatter, dry_run: bool, backup: bool) -> String {
    match (dry_run, backup) {
        (true, true) => {
            formatter.title("[dry-run] 0 of 0 objects can be moved to the backup directory")
        }
        (true, false) => formatter.title("[dry-run] 0 of 0 objects can be removed"),
        (false, true) => formatter.success_summary("moved 0 objects (0 B) to the backup directory"),
        (false, false) => formatter.success_summary("removed 0 objects, freed 0 B"),
    }
}

fn empty_gc_size_line(formatter: &Formatter, chalk: Chalk, dry_run: bool, backup: bool) -> String {
    match (dry_run, backup) {
        (true, true) => formatter.item(&format!(
            "scope: {} {}",
            chalk.bold("0 B"),
            chalk.dim("(0 B of it would move to the backup directory)"),
        )),
        (false, true) => formatter.item(&format!(
            "scope: {} {}",
            chalk.bold("0 B"),
            chalk.dim("(0 B of it is in the backup directory)"),
        )),
        (true, false) => formatter.item(&format!(
            "scope: 0 B \u{2192} {} {}",
            chalk.bold("0 B"),
            chalk.dim("(would free 0 B)"),
        )),
        (false, false) => formatter.item(&format!("scope: 0 B \u{2192} {}", chalk.bold("0 B"))),
    }
}

fn emit_json(root: &ScopeRoot, args: &[OsString], payload: &Value) -> io::Result<Outcome> {
    let history = (!root.bare).then(|| History::start(&root.path, args));
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(payload)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn emit_report(root: &ScopeRoot, args: &[OsString], data: String) -> io::Result<Outcome> {
    let report = Report { data, code: 0, details: None };
    if root.bare {
        workspace_command::execute_with_scope(&root.path, args, "gc", &report)
    } else {
        workspace_command::execute_then(&root.path, args, "gc", |_| Ok(report))
    }
}

fn emit_error(
    cwd: &Path,
    root_opt: Option<&ScopeRoot>,
    args: &[OsString],
    json_flag: bool,
    msg: &str,
) -> io::Result<Outcome> {
    if json_flag || env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI/json gc error delegated".into()));
    }
    let err = io::Error::other(msg.to_owned());
    match root_opt {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "gc", |_| Err(err))
        }
        Some(root) => {
            workspace_command::execute_failure_scope(&root.path, args, "gc", false, "", err)
        }
        None => workspace_command::execute_failure_scope(cwd, args, "gc", false, "", err),
    }
}

//! Native `bit gc` (`scopes/workspace/clear-cache/gc-cmd.ts`).

mod bare;
mod collector;
mod format;
mod graph;
mod inventory;
use crate::commands::workspace_command::filesystem_error as io_error;
mod restore;
#[cfg(test)]
mod tests;

use self::{
    collector::prepare_workspace_garbage,
    format::{GcResult, GcRunFlags, format_gc_report},
};
use super::{
    Command,
    color::Chalk,
    lane::scope_root::{self, ScopeRoot},
    workspace_command::{self, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
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
    let root_opt = match scope_root::discover() {
        Ok(root) => root,
        Err(error) => return Ok(Outcome::Declined(format!("gc scope preflight: {error}"))),
    };
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
    if !root.bare {
        return run_workspace_gc(&root, args, &options);
    }
    bare::run(&root.path, args, &options)
}

fn run_workspace_gc(root: &ScopeRoot, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let scope_dir = workspace::scope_path(&root.path);
    let index = match restore::workspace_index(&root.path, &scope_dir) {
        Ok(index) => index,
        Err(error) => {
            return Ok(Outcome::Declined(format!("collection startup preflight: {error}")));
        }
    };
    if is_workspace_scope_empty(&scope_dir) {
        return run_empty_workspace_gc(root, args, options);
    }
    if cfg!(windows) {
        return Ok(Outcome::Declined(
            "Windows collection repository enumeration requires the published runtime".into(),
        ));
    }
    let plan = match prepare_workspace_garbage(&root.path, &scope_dir, options) {
        Ok(Some(plan)) => plan,
        Ok(None) => return Ok(Outcome::Declined("gc workspace config delegated".into())),
        Err(error) => {
            return Ok(Outcome::Declined(format!("workspace collection preflight: {error}")));
        }
    };
    if options.verbose && !options.json && plan.result.deleted.objects > 1 {
        return Ok(Outcome::Declined("workspace verbose deletion ordering".into()));
    }
    if let Err(error) = plan.validate(&scope_dir) {
        return Ok(Outcome::Declined(error.to_string()));
    }
    execute_workspace_gc(root, args, options, &plan, index)
}

fn execute_workspace_gc(
    root: &ScopeRoot,
    args: &[OsString],
    options: &Options,
    plan: &collector::Plan,
    index: Option<Vec<u8>>,
) -> io::Result<Outcome> {
    let scope_dir = workspace::scope_path(&root.path);
    let chalk = Chalk::detect(args);
    let data = if options.json {
        serde_json::to_string_pretty(&plan.result)?
    } else {
        format_gc_report(&plan.result, chalk)
    };
    let work = |output: &bit_install::output::Output| {
        if let Some(bytes) = index {
            let path = scope_dir.join("index.json");
            fs::write(&path, bytes)
                .map_err(|error| {
                    io_error::report(&io_error::failure(error, "open", &path), chalk)
                })?;
        }
        if options.verbose {
            plan.log(output);
        }
        plan.execute(&scope_dir).map_err(|error| io_error::report(&error, chalk))?;
        Ok(Report { data, code: 0, details: None })
    };
    if options.json {
        workspace_command::execute_json(&root.path, args, "gc", work)
    } else {
        workspace_command::execute_then(&root.path, args, "gc", work)
    }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        if args[idx] == "--" {
            return (idx + 1 == args.len()).then_some(opts);
        }
        idx += apply_gc_arg(&mut opts, args[idx], args.get(idx + 1).copied())?;
    }
    Some(opts)
}

fn apply_gc_arg(opts: &mut Options, arg: &str, next: Option<&str>) -> Option<usize> {
    if let Some(val) = arg.strip_prefix("--keep-versions=") {
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        opts.keep_versions = Some(val.to_owned());
        return Some(1);
    }
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-d" | "--dry-run" | "--dry-run=true" => opts.dry_run = true,
        "--dry-run=false" => opts.dry_run = false,
        "--backup" | "--backup=true" => opts.backup = true,
        "--backup=false" => opts.backup = false,
        "--restore" | "--restore=true" => opts.restore = true,
        "--restore=false" => opts.restore = false,
        "--restore-overwrite" | "--restore-overwrite=true" => opts.restore_overwrite = true,
        "--restore-overwrite=false" => opts.restore_overwrite = false,
        "-v" | "--verbose" | "--verbose=true" => opts.verbose = true,
        "--verbose=false" => opts.verbose = false,
        "-j" | "--json" | "--json=true" => opts.json = true,
        "--json=false" => opts.json = false,
        "--keep-versions" => {
            let val = next.filter(|val| !val.is_empty() && !val.starts_with('-'))?;
            opts.keep_versions = Some(val.to_owned());
            return Some(2);
        }
        val => apply_gc_short_flags(val, opts)?,
    }
    Some(1)
}

fn apply_gc_short_flags(arg: &str, opts: &mut Options) -> Option<()> {
    let flags = arg
        .strip_prefix('-')
        .filter(|flags| !flags.is_empty() && !flags.starts_with('-'))?;
    for ch in flags.chars() {
        match ch {
            'd' => opts.dry_run = true,
            'v' => opts.verbose = true,
            'j' => opts.json = true,
            _ => return None,
        }
    }
    Some(())
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
    if root.bare {
        return bare::restore(&root.path, args, options);
    }
    restore::workspace(&root.path, args, options)
}

fn is_workspace_scope_empty(scope_dir: &Path) -> bool {
    !dir_has_any_file(&scope_dir.join("objects"))
        && !dir_has_any_file(&scope_dir.join("deleted-objects"))
        && !dir_has_any_file(&scope_dir.join("stash"))
        && !dir_has_any_file(&scope_dir.join("trash"))
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
    let empty_res = GcResult {
        flags: GcRunFlags { dry_run: options.dry_run, backup: options.backup, backup_dir: None },
        ..GcResult::default()
    };
    if options.json {
        let payload = serde_json::to_value(&empty_res).map_err(io::Error::other)?;
        return emit_json(root, args, &payload);
    }
    let chalk = Chalk::detect(args);
    let data = format_empty_gc_report(options.dry_run, options.backup, chalk);
    emit_report(root, args, data)
}

pub(super) fn format_empty_gc_report(dry_run: bool, backup: bool, chalk: Chalk) -> String {
    let empty_res =
        GcResult { flags: GcRunFlags { dry_run, backup, backup_dir: None }, ..GcResult::default() };
    format_gc_report(&empty_res, chalk)
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

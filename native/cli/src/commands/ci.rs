//! Native `bit ci [verify|pr|merge|sync]` (`scopes/git/ci/ci.cmd.ts`).

mod init;
mod merge;
mod pr;
#[cfg(test)]
mod tests;

use self::{
    merge::{MergeOptions, parse_merge, run_merge},
    pr::{PrOptions, parse_pr, run_pr},
};
use super::{
    Command,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::Command as ProcessCommand,
};

pub const COMMAND: Command = Command { name: "ci", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";
const INVALID_MERGE_RESOLVE_ERR: &str =
    "--auto-merge-resolve must be one of the following: [ours, theirs, manual]";
const INIT_COMBINED_ERR: &str = "bit ci sync --init cannot be combined with a lane argument, --branch, --all, --main or --dry-run: it only scaffolds onboarding files (workflows + workspace.jsonc config) and exits \u{2014} it never reconciles";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct SyncOptions {
    pub lane: Option<String>,
    pub branch: Option<String>,
    pub all: bool,
    pub main: bool,
    pub dry_run: bool,
    pub init: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Bare,
    Verify,
    Pr(PrOptions),
    Merge(MergeOptions),
    Sync(SyncOptions),
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Bare => "ci",
            Self::Verify => "verify",
            Self::Pr(_) => "pr",
            Self::Merge(_) => "merge",
            Self::Sync(_) => "sync",
        }
    }

    const fn init_banner(&self) -> &'static str {
        match self {
            Self::Bare => "",
            Self::Verify => "\n\n\u{1f680} Initializing Verify command\n",
            Self::Pr(_) => "\n\n\n\u{1f680} Initializing PR command\n",
            Self::Merge(_) => "\n\n\n\u{1f680} Initializing Merge command\n",
            Self::Sync(_) => "\n\n\nInitializing sync command\n",
        }
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ci arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native ci grammar".into()));
    };
    let cwd = env::current_dir()?;
    let root_opt = workspace::root(&cwd);
    if matches!(subcommand, Subcommand::Bare) {
        return run_bare(&cwd, root_opt.as_deref(), args);
    }
    let Some(root) = root_opt else {
        return emit_outside_workspace(&cwd, args, &subcommand);
    };
    match &subcommand {
        Subcommand::Pr(opts) => run_pr(&root, args, opts),
        Subcommand::Merge(opts) => {
            if let Some(strategy) = &opts.auto_merge_resolve
                && !matches!(strategy.as_str(), "ours" | "theirs" | "manual")
            {
                return emit_subcommand_error(&root, args, &subcommand, INVALID_MERGE_RESOLVE_ERR);
            }
            run_merge(&root, args, opts)
        }
        Subcommand::Sync(opts) => run_sync(&root, args, opts),
        _ => Ok(Outcome::Declined("ci subcommand execution delegated".into())),
    }
}

fn run_sync(root: &Path, args: &[OsString], options: &SyncOptions) -> io::Result<Outcome> {
    match validate_sync_options(options) {
        Err(message) => {
            emit_subcommand_error(root, args, &Subcommand::Sync(options.clone()), &message)
        }
        Ok(()) if options.init => init::run(root, args),
        Ok(()) => Ok(Outcome::Declined("ci sync execution delegated".into())),
    }
}

fn run_bare(cwd: &Path, root_opt: Option<&Path>, args: &[OsString]) -> io::Result<Outcome> {
    let report = Report { data: "[ci] not implemented".into(), code: 1, details: None };
    if let Some(root) = root_opt {
        workspace_command::execute_then(root, args, "ci", |_| Ok(report))
    } else {
        workspace_command::execute_with_scope(cwd, args, "ci", &report)
    }
}

fn emit_outside_workspace(
    cwd: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ci outside-workspace error delegated".into()));
    }
    workspace_command::execute_failure_scope(
        cwd,
        args,
        subcommand.loader_label(),
        false,
        subcommand.init_banner(),
        io::Error::other(OUTSIDE_WORKSPACE_ERR),
    )
}

fn emit_subcommand_error(
    root: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    message: &str,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI ci error delegated".into()));
    }
    let banner = subcommand.init_banner();
    let msg = message.to_owned();
    workspace_command::execute_then(root, args, subcommand.loader_label(), |_output| {
        io::stdout().lock().write_all(banner.as_bytes())?;
        Err(io::Error::other(msg))
    })
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        [] => Some(Subcommand::Bare),
        ["verify"] => Some(Subcommand::Verify),
        ["pr", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_pr(rest).map(Subcommand::Pr)
        }
        ["merge", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_merge(rest).map(Subcommand::Merge)
        }
        ["sync", rest @ ..] => parse_sync(rest).map(Subcommand::Sync),
        _ => None,
    }
}

fn parse_sync(rest: &[&str]) -> Option<SyncOptions> {
    let mut opts = SyncOptions::default();
    let mut idx = 0;
    while idx < rest.len() {
        idx += apply_sync_arg(&mut opts, rest[idx], rest.get(idx + 1).copied())?;
    }
    Some(opts)
}

fn apply_sync_arg(opts: &mut SyncOptions, arg: &str, next: Option<&str>) -> Option<usize> {
    if let Some(val) = arg.strip_prefix("--branch=") {
        if val.is_empty() || val.starts_with('-') {
            return None;
        }
        opts.branch = Some(val.to_owned());
        return Some(1);
    }
    match arg {
        "--all" | "--all=true" => opts.all = true,
        "--all=false" => opts.all = false,
        "--main" | "--main=true" => opts.main = true,
        "--main=false" => opts.main = false,
        "--dry-run" | "--dry-run=true" => opts.dry_run = true,
        "--dry-run=false" => opts.dry_run = false,
        "--init" | "--init=true" => opts.init = true,
        "--init=false" => opts.init = false,
        "--branch" => {
            opts.branch = Some(
                next.filter(|val| !val.is_empty() && !val.starts_with('-'))?
                    .into(),
            );
            return Some(2);
        }
        val if !val.starts_with('-') && opts.lane.is_none() => {
            opts.lane = Some(val.to_owned());
        }
        _ => return None,
    }
    Some(1)
}

pub(super) fn validate_sync_options(opts: &SyncOptions) -> Result<(), String> {
    if opts.init {
        if opts.lane.is_some() || opts.branch.is_some() || opts.all || opts.main || opts.dry_run {
            return Err(INIT_COMBINED_ERR.into());
        }
        return Ok(());
    }
    let selectors = collect_sync_selectors(opts);
    if opts.all
        && let Some(narrow) = selectors.first()
    {
        return Err(format!(
            "--all cannot be combined with {narrow}: --all reconciles every mapped lane plus the main scope, and is what runs when no target is given",
        ));
    }
    if selectors.len() > 1 {
        let winner = sync_winner_label(opts);
        return Err(format!(
            "{} cannot be combined with {}: each selects the single target this run reconciles, and only {winner} would have run \u{2014} the rest would be silently dropped, leaving a run that reports success while a target you named was never visited",
            selectors[0],
            selectors[1..].join(" or with "),
        ));
    }
    Ok(())
}

fn collect_sync_selectors(opts: &SyncOptions) -> Vec<String> {
    let mut selectors = Vec::new();
    if let Some(lane) = &opts.lane {
        selectors.push(format!(r#"a lane argument ("{lane}")"#));
    }
    if let Some(branch) = &opts.branch {
        selectors.push(format!(r#"--branch ("{branch}")"#));
    }
    if opts.main {
        selectors.push("--main".into());
    }
    selectors
}

fn sync_winner_label(opts: &SyncOptions) -> String {
    if opts.main {
        "--main".into()
    } else {
        format!(r#"--branch ("{}")"#, opts.branch.as_deref().unwrap_or_default())
    }
}

pub(super) fn run_child_bit(root: &Path, bit_args: &[&str]) -> io::Result<String> {
    let exe = env::current_exe()?;
    let output = ProcessCommand::new(exe)
        .current_dir(root)
        .args(bit_args)
        .env("BIT_DISABLE_SPINNER", "true")
        .env("CI", "true")
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(io::Error::other(format!("{stdout}\n{stderr}")))
    }
}

pub(super) fn run_git(root: &Path, git_args: &[&str]) -> io::Result<String> {
    let exe = super::diff::git::executable(root).unwrap_or_else(|_| "git".into());
    let output = ProcessCommand::new(exe)
        .current_dir(root)
        .args(git_args)
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    } else {
        Err(io::Error::other(String::from_utf8_lossy(&output.stderr).trim().to_owned()))
    }
}

pub(super) fn git_current_branch(root: &Path) -> Option<String> {
    run_git(root, &["symbolic-ref", "-q", "--short", "HEAD"])
        .or_else(|_| run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"]))
        .ok()
        .filter(|branch| !branch.is_empty())
}

pub(super) fn git_last_commit_message(root: &Path) -> Option<String> {
    run_git(root, &["log", "-1", "--pretty=%B"])
        .ok()
        .filter(|msg| !msg.is_empty())
}

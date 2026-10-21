//! Native `bit ci [verify|pr|merge|sync]` (`scopes/git/ci/ci.cmd.ts`).

#[cfg(test)]
mod tests;

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
    Pr,
    Merge { auto_merge_resolve: Option<String> },
    Sync(SyncOptions),
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Bare => "ci",
            Self::Verify => "verify",
            Self::Pr => "pr",
            Self::Merge { .. } => "merge",
            Self::Sync(_) => "sync",
        }
    }

    const fn init_banner(&self) -> &'static str {
        match self {
            Self::Bare => "",
            Self::Verify => "\n\n\u{1f680} Initializing Verify command\n",
            Self::Pr => "\n\n\n\u{1f680} Initializing PR command\n",
            Self::Merge { .. } => "\n\n\n\u{1f680} Initializing Merge command\n",
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
        Subcommand::Merge { auto_merge_resolve: Some(strategy) }
            if !matches!(strategy.as_str(), "ours" | "theirs" | "manual") =>
        {
            emit_subcommand_error(&root, args, &subcommand, INVALID_MERGE_RESOLVE_ERR)
        }
        Subcommand::Sync(opts) => match validate_sync_options(opts) {
            Err(err_msg) => emit_subcommand_error(&root, args, &subcommand, &err_msg),
            Ok(()) => Ok(Outcome::Declined("ci sync execution delegated".into())),
        },
        _ => Ok(Outcome::Declined("ci subcommand execution delegated".into())),
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
            Some(Subcommand::Pr)
        }
        ["merge", rest @ ..] if !rest.contains(&"--help") && !rest.contains(&"-h") => {
            parse_merge(rest)
        }
        ["sync", rest @ ..] => parse_sync(rest).map(Subcommand::Sync),
        _ => None,
    }
}

fn parse_merge(rest: &[&str]) -> Option<Subcommand> {
    let mut auto_merge_resolve = None;
    let mut idx = 0;
    while idx < rest.len() {
        match rest[idx] {
            "-r" | "--auto-merge-resolve" => {
                idx += 1;
                auto_merge_resolve = Some((*rest.get(idx)?).to_owned());
            }
            arg if arg.starts_with("--auto-merge-resolve=") => {
                auto_merge_resolve = Some(arg["--auto-merge-resolve=".len()..].to_owned());
            }
            _ => {}
        }
        idx += 1;
    }
    Some(Subcommand::Merge { auto_merge_resolve })
}

fn parse_sync(rest: &[&str]) -> Option<SyncOptions> {
    let mut opts = SyncOptions::default();
    let mut idx = 0;
    while idx < rest.len() {
        match rest[idx] {
            "--all" => opts.all = true,
            "--main" => opts.main = true,
            "--dry-run" => opts.dry_run = true,
            "--init" => opts.init = true,
            "--branch" => {
                idx += 1;
                opts.branch = Some((*rest.get(idx)?).to_owned());
            }
            arg if arg.starts_with("--branch=") => {
                opts.branch = Some(arg["--branch=".len()..].to_owned());
            }
            arg if !arg.starts_with('-') && opts.lane.is_none() => {
                opts.lane = Some(arg.to_owned());
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(opts)
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

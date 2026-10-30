//! Native `bit lane merge <lane> [pattern] -x`: a merge workspace command
//! (`workspace_command`) with the lane options, the lane step, and the whole
//! merge report; and `bit lane list` (`list`). Other `bit lane` commands are
//! left to the Node.js CLI.

pub(crate) mod scope_root;

mod alias;
mod create;
mod current;
mod diff;
mod history;
mod import;
mod list;
mod manage;
mod options;
mod remove;
mod restoration;
mod show;

use super::{merge::report, workspace_command};
use crate::{commands::Command, native::Outcome};
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "lane", aliases: &["l"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(raw_argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let argv: Vec<&str> = raw_argv
        .into_iter()
        .filter(|arg| *arg != "--no-color")
        .collect();
    match argv.get(1).copied() {
        None => list::run_default(args, &argv[1..]),
        Some(flag) if flag.starts_with('-') => list::run_default(args, &argv[1..]),
        Some("list") => list::run(args, &argv[2..]),
        Some("current") => current::current(args, &argv[2..]),
        Some("create") => create::run(args, &argv[2..]),
        Some("alias") => alias::run(args, &argv[2..]),
        Some("rename") => manage::rename(args, &argv[2..]),
        Some("change-scope") => manage::change_scope(args, &argv[2..]),
        Some("remove-readme") => manage::remove_readme(args, &argv[2..]),
        Some("remove-comp" | "rc") => manage::remove_comp(args, &argv[2..]),
        Some("fetch") => manage::fetch(args, &argv[2..]),
        Some("eject") => manage::eject(args, &argv[2..]),
        Some("updates") => manage::updates(args, &argv[2..]),
        Some("history-diff") => manage::history_diff(args, &argv[2..]),
        Some("diff") => diff::run(args, &argv[2..]),
        Some("merge-move") => create::merge_move(args, &argv[2..]),
        Some("history") => history::run(args, &argv[2..]),
        Some("checkout" | "revert") => restoration::run(args, &argv),
        Some("show") => show::show(args, &argv[2..]),
        Some("import") => import::run(args, &argv),
        Some("remove") => remove::run(args, &argv[2..]),
        Some("merge") => merge(args, &argv),
        Some("merge-abort") => super::recovery::parse_lane(&argv[2..])
            .map_or_else(
                || Ok(Outcome::Declined("outside the native lane merge-abort grammar".to_string())),
                |options| super::recovery::run(args, &options),
            ),
        _ => Ok(Outcome::Declined("a lane command outside the native grammar".to_string())),
    }
}

fn merge(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some((workflow, grammar)) = super::merge::lifecycle::workflow(&argv[2..]) else {
        return Ok(Outcome::Declined("outside the native lane tooling grammar".into()));
    };
    let Some(options) = options::parse(&grammar) else {
        return fallback_lane_merge_error(args, &grammar);
    };
    let Some(root) = crate::workspace::root(&std::env::current_dir()?) else {
        return emit_lane_merge_error(args, "unable to merge a lane outside of Bit workspace");
    };
    match super::merge::lifecycle::run(
        &root,
        args,
        argv,
        super::merge::lifecycle::Options {
            request: options.request(),
            mode: report::Mode { verbose: options.verbose, lane: true },
            message: options.message,
            skip_install: options.skip_install,
            workflow,
        },
    )? {
        Outcome::Declined(reason)
            if reason.contains("lane filter excludes a required lane dependency") =>
        {
            workspace_command::execute_then(&root, args, "merge", |_| {
                Err(io::Error::other(
                    "Failed to merge the lane partially as some components have dependencies which were not included.\nconsider adding \"--include-deps\" flag to include them.",
                ))
            })
        }
        outcome => Ok(outcome),
    }
}

fn fallback_lane_merge_error(args: &[OsString], grammar: &[&str]) -> io::Result<Outcome> {
    let Some(err_msg) = options::validate_error(grammar) else {
        return Ok(Outcome::Declined("outside the native lane merge grammar".into()));
    };
    emit_lane_merge_error(args, err_msg)
}

fn emit_lane_merge_error(args: &[OsString], err_msg: &'static str) -> io::Result<Outcome> {
    if std::env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI lane merge validation".into()));
    }
    let cwd = std::env::current_dir()?;
    let err = io::Error::other(err_msg);
    if let Some(root) = crate::workspace::root(&cwd) {
        return workspace_command::execute_then(&root, args, "merge", |_| Err(err));
    }
    workspace_command::execute_failure_scope(&cwd, args, "merge", false, "", err)
}

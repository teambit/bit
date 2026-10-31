//! Native `bit merge [component-pattern] -x`, a workspace command
//! (`workspace_command`) with the merge options and report, and
//! `bit merge --resolve` (`resolve`), retaining one provider session through snapshots.

pub(super) mod install;
pub(super) mod lifecycle;
pub(super) mod report;
pub(super) mod resolve;

mod failures;
mod options;

use super::workspace_command;
use crate::{commands::Command, native::Outcome};
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "merge", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    if let Some(resolve) = resolve::parse(&argv[1..]) {
        return resolve::run(args, &resolve);
    }
    if let Some(abort) = super::recovery::parse_component(&argv[1..]) {
        return super::recovery::run(args, &abort);
    }
    let Some((workflow, grammar)) = lifecycle::workflow(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native merge tooling grammar".into()));
    };
    let Some(options) = options::parse(&grammar) else {
        return fallback_merge_error(args, &argv[1..]);
    };
    let root = match workspace_command::workspace_or_fail(args, "merge")? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    lifecycle::run(
        &root,
        args,
        &argv,
        lifecycle::Options {
            request: options.request(),
            mode: report::Mode { verbose: options.verbose, lane: false },
            message: options.message,
            skip_install: options.skip_install,
            workflow,
        },
    )
}

fn fallback_merge_error(args: &[OsString], raw_args: &[&str]) -> io::Result<Outcome> {
    let Some(err_msg) = options::validate_error(raw_args) else {
        return Ok(Outcome::Declined("outside the native merge grammar".into()));
    };
    if is_ci_environment() {
        return Ok(Outcome::Declined("outside the native merge grammar".into()));
    }
    let json = raw_args
        .iter()
        .any(|arg| matches!(arg.trim(), "-j" | "--json" | "--json=true"));
    let cwd = std::env::current_dir()?;
    if let Some(root) = crate::workspace::root(&cwd) {
        if json {
            return workspace_command::execute_json(&root, args, "merge", |_| {
                Err(io::Error::other(err_msg))
            });
        }
        return workspace_command::execute_then(&root, args, "merge", |_| {
            Err(io::Error::other(err_msg))
        });
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        "merge",
        json,
        "",
        io::Error::other(err_msg),
    )
}

fn is_ci_environment() -> bool {
    std::env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("0")
                && !trimmed.eq_ignore_ascii_case("false")
        })
}

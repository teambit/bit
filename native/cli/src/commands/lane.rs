//! Native `bit lane merge <lane> [pattern] -x`: a merge workspace command
//! (`workspace_command`) with the lane options, the lane step, and the whole
//! merge report; and `bit lane list` (`list`). Other `bit lane` commands are
//! left to the Node.js CLI.

pub(crate) mod scope_root;

mod alias;
mod create;
mod current;
mod history;
mod import;
mod list;
mod manage;
mod options;
mod remove;
mod restoration;
mod show;

use super::{merge::report, workspace_command};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "lane", aliases: &["l"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    match argv.get(1).copied() {
        Some("list") => list::run(args, &argv[2..]),
        Some("current") => current::current(args, &argv[2..]),
        Some("create") => create::run(args, &argv[2..]),
        Some("alias") => alias::run(args, &argv[2..]),
        Some("rename") => manage::rename(args, &argv[2..]),
        Some("change-scope") => manage::change_scope(args, &argv[2..]),
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
        return Ok(Outcome::Declined("outside the native lane merge grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    super::merge::lifecycle::run(
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
    )
}

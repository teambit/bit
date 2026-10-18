//! Scope identity mutation keeps one native batch and one retained provider/tooling session.
mod execution;
mod options;
mod report;
use super::{Command, add::ProjectedLinker, color::Chalk, workspace_command};
use crate::{native::Outcome, workspace};
use bit_object_import::component_scope_rename::Selection;
use std::{env, ffi::OsString, io};
pub const COMMAND: Command = Command { name: "scope", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    if args
        .get(1)
        .is_some_and(|arg| arg == "fork")
    {
        return super::fork::run_scope(args);
    }
    run_rename(args)
}
fn run_rename(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("scope rename arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native scope rename grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("scope rename requires a workspace".into()));
    };
    if let Err(error) = Selection::prepare(&root, &options)
        && decline_preflight(&error)
    {
        return Ok(Outcome::Declined(format!("scope rename: {error}")));
    }
    let mut linker = if options.owner || options.skip_install {
        ProjectedLinker::prepare(&root)?
    } else {
        ProjectedLinker::prepare_with_installation(&root, args)?
    };
    print!("{}", linker.take_stdout());
    if options.owner {
        workspace_command::execute_without_loader(&root, args, "rename-owner", |output| {
            execution::run(&root, &options, &mut linker, Chalk::detect(args), output)
        })
    } else {
        workspace_command::execute_then(&root, args, "rename", |output| {
            execution::run(&root, &options, &mut linker, Chalk::detect(args), output)
        })
    }
}

fn decline_preflight(error: &io::Error) -> bool {
    error.kind() != io::ErrorKind::InvalidInput
        || env::var_os("CI").is_some_and(|value| !value.is_empty())
}

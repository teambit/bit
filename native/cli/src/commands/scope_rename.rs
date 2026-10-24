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
    if args
        .get(1)
        .is_some_and(|arg| arg == "set")
    {
        return super::scope_set::run(args);
    }
    if args
        .get(1)
        .is_some_and(|arg| arg == "trust")
    {
        return super::scope_trust::run(args);
    }
    if let Some(sub) = unrecognized_subcommand(args)
        && let Some(root) = workspace::root(&env::current_dir()?)
    {
        let chalk = Chalk::detect(args);
        let data = chalk.red(&format!(
            r#""{sub}" is not a subcommand of "scope", please run "bit scope --help" to list the subcommands"#,
        ));
        return workspace_command::execute_then(&root, args, "scope", |_output| {
            Ok(workspace_command::results::Report { data, code: 0, details: None })
        });
    }
    run_rename(args)
}

fn unrecognized_subcommand(args: &[OsString]) -> Option<String> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let filtered = tokens
        .into_iter()
        .filter(|token| *token != "--no-color")
        .collect::<Vec<_>>();
    let [sub] = filtered.as_slice() else {
        return None;
    };
    (!sub.starts_with('-') && !matches!(*sub, "fork" | "set" | "trust" | "rename" | "rename-owner"))
        .then(|| (*sub).to_owned())
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

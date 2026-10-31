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
    let first = first_subcommand(args);
    if first.as_deref() == Some("fork") {
        return super::fork::run_scope(args);
    }
    if first.as_deref() == Some("set") {
        let outcome = super::scope_set::run(args)?;
        if !matches!(outcome, Outcome::Declined(_)) {
            return Ok(outcome);
        }
    }
    if first.as_deref() == Some("trust") {
        let outcome = super::scope_trust::run(args)?;
        if !matches!(outcome, Outcome::Declined(_)) {
            return Ok(outcome);
        }
    }
    let in_ws = env::current_dir()
        .ok()
        .is_some_and(|cwd| workspace::root(&cwd).is_some());
    if let Some(sub) = unrecognized_subcommand(args, in_ws) {
        return handle_unrecognized_subcommand(args, &sub);
    }
    run_rename(args)
}

fn first_subcommand(args: &[OsString]) -> Option<String> {
    args.iter()
        .skip(1)
        .filter_map(|arg| arg.to_str())
        .find(|token| !matches!(*token, "--no-color" | "--no-color=true" | "--no-color=false"))
        .map(str::to_owned)
}

fn handle_unrecognized_subcommand(args: &[OsString], sub: &str) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI scope unrecognized subcommand".into()));
    }
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "scope", please run "bit scope --help" to list the subcommands"#,
    ));
    let report = workspace_command::results::Report { data, code: 0, details: None };
    if let Some(root) = workspace::root(&cwd) {
        workspace_command::execute_then(&root, args, "scope", move |_output| Ok(report))
    } else {
        workspace_command::execute_with_scope(&cwd, args, "scope", &report)
    }
}

pub(super) fn unrecognized_subcommand(args: &[OsString], in_ws: bool) -> Option<String> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let filtered = tokens
        .into_iter()
        .filter(|token| !matches!(*token, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        [sub] => {
            let is_known = matches!(*sub, "fork" | "rename" | "rename-owner")
                || (in_ws && matches!(*sub, "set" | "trust"));
            (!sub.starts_with('-') && !is_known).then(|| (*sub).to_owned())
        }
        [sub @ ("set" | "trust"), rest @ ..]
            if !in_ws && !rest.contains(&"--help") && !rest.contains(&"-h") =>
        {
            Some((*sub).to_owned())
        }
        _ => None,
    }
}
fn run_rename(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("scope rename arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native scope rename grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return handle_outside_workspace(&cwd, args, options.owner);
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

fn handle_outside_workspace(
    cwd: &std::path::Path,
    args: &[OsString],
    owner: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("scope rename requires a workspace".into()));
    }
    let err = io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR);
    if owner {
        workspace_command::execute_without_loader_scope(cwd, args, "rename-owner", move |_| {
            Err(err)
        })
    } else {
        workspace_command::execute_failure_scope(cwd, args, "rename", false, "", err)
    }
}

fn decline_preflight(error: &io::Error) -> bool {
    error.kind() != io::ErrorKind::InvalidInput
        || env::var_os("CI").is_some_and(|value| !value.is_empty())
}

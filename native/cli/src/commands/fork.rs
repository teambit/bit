//! Copy, track and refactor forked components while retaining published extension classes.
mod execution;
mod inventory;
mod options;
mod policy;
mod report;
mod selection;
use super::{Command, add::ProjectedLinker, color::Chalk, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};
pub const COMMAND: Command = Command { name: "fork", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    run_mode(args, false)
}
pub(in crate::commands) fn run_scope(args: &[OsString]) -> io::Result<Outcome> {
    run_mode(args, true)
}
fn run_mode(args: &[OsString], scope_fork: bool) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("fork arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[if scope_fork { 2 } else { 1 }..], scope_fork) else {
        return Ok(Outcome::Declined("outside native fork grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return handle_outside_workspace(&cwd, args, scope_fork);
    };
    let state = match inventory::read(&root) {
        Ok(state) => state,
        Err(error) => return Ok(Outcome::Declined(format!("fork: {error}"))),
    };
    if let Some(reason) = unsupported(&root, &options, &state) {
        return Ok(Outcome::Declined(reason));
    }
    execute(args, &root, &options, &state)
}
fn handle_outside_workspace(
    cwd: &std::path::Path,
    args: &[OsString],
    scope_fork: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("fork requires a workspace".into()));
    }
    let err = io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR);
    if scope_fork {
        workspace_command::execute_without_loader_scope(cwd, args, "fork", move |_| Err(err))
    } else {
        workspace_command::execute_failure_scope(cwd, args, "fork", false, "", err)
    }
}
fn execute(
    args: &[OsString],
    root: &std::path::Path,
    options: &options::Options,
    state: &serde_json::Value,
) -> io::Result<Outcome> {
    let install = !options.flags.skip_install
        && (options.multiple() || inventory::selected(state, &options.source).is_none());
    let mut linker = if install {
        ProjectedLinker::prepare_with_installation(root, args)?
    } else {
        ProjectedLinker::prepare(root)?
    };
    print!("{}", linker.take_stdout());
    let work = |output: &bit_install::output::Output| {
        execution::run(root, options, &mut linker, Chalk::detect(args), output)
    };
    if options.scope_fork {
        workspace_command::execute_without_loader(root, args, "fork", work)
    } else {
        workspace_command::execute_then(root, args, "fork", work)
    }
}
fn unsupported(
    root: &std::path::Path,
    options: &options::Options,
    state: &serde_json::Value,
) -> Option<String> {
    if options.source.contains('@')
        && inventory::selected(
            state,
            options.source
                .split('@')
                .next()
                .unwrap(),
        )
        .is_some()
    {
        return Some("forking a requested historical workspace version".into());
    }
    if let Err(error) = preflight(root, options, state)
        && error.kind() != io::ErrorKind::InvalidInput
    {
        return Some(format!("fork: {error}"));
    }
    None
}
fn preflight(
    root: &std::path::Path,
    options: &options::Options,
    state: &serde_json::Value,
) -> io::Result<()> {
    if options.multiple() {
        return Ok(());
    }
    let Some(source) = inventory::selected(state, &options.source) else {
        return Ok(());
    };
    let kernel = bit_object_import::component_fork::Options {
        source: source["identity"]
            .as_str()
            .unwrap()
            .into(),
        target: options.target.clone(),
        scope: options.scope.clone(),
        path: options.path.clone(),
        remote: false,
        preserve: options.flags.preserve,
        ast: options.flags.ast,
        no_link: options.flags.no_link,
    };
    bit_object_import::component_fork::Plan::prepare(root, &kernel, source)?;
    Ok(())
}

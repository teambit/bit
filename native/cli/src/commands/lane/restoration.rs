//! Historical lane targets use retained native selection and complete checkout phases.
mod diagnostics;
mod installation;
mod options;
mod report;
mod session;

use crate::{
    commands::{status::autosync::Startup, workspace_command},
    native::Outcome,
    workspace,
};
use options::Options;
use std::{env, ffi::OsString, io, path::Path};

pub(super) fn run(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    let Some(options) = Options::parse(argv) else {
        return Ok(Outcome::Declined("outside the native lane history restoration grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if is_ci_active() {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        let msg = format!(r#"unable to checkout history "{}" while on main"#, options.id.trim());
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            options.command(),
            options.json,
            "",
            io::Error::other(msg),
        );
    };
    run_in_workspace(&root, args, argv, &options)
}

fn run_in_workspace(
    root: &Path,
    args: &[OsString],
    argv: &[&str],
    options: &Options,
) -> io::Result<Outcome> {
    if diagnostics::requires_node(root, &options.id) {
        return Ok(Outcome::Declined(
            "CI lane history diagnostics require the published stack".into(),
        ));
    }
    let mut startup = Startup::default();
    let session = match session::Session::start(root, argv, options, &mut startup) {
        Ok(session) => session,
        Err(error) if startup.committed || crate::commands::engine::is_canonical(&error) => {
            return failure(root, args, options, &startup, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("lane history restoration: {error}"))),
    };
    workspace_command::checkout_lifecycle::before(&startup)?;
    if options.json {
        workspace_command::execute_json(root, args, options.command(), |output| {
            session.run(root, args, options, startup, output)
        })
    } else {
        workspace_command::execute_then(root, args, options.command(), |output| {
            session.run(root, args, options, startup, output)
        })
    }
}

fn failure(
    root: &Path,
    args: &[OsString],
    options: &Options,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    workspace_command::checkout_lifecycle::before(startup)?;
    let work = |output: &bit_install::output::Output| {
        session::render_failure(startup, output, &error)?;
        Err(error)
    };
    if options.json {
        workspace_command::execute_json(root, args, options.command(), work)
    } else {
        workspace_command::execute_then(root, args, options.command(), work)
    }
}

fn is_ci_active() -> bool {
    env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}

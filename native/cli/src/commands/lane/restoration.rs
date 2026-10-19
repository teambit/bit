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
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if diagnostics::requires_node(&root, &options.id) {
        return Ok(Outcome::Declined(
            "CI lane history diagnostics require the published stack".into(),
        ));
    }
    let mut startup = Startup::default();
    let session = match session::Session::start(&root, argv, &options, &mut startup) {
        Ok(session) => session,
        Err(error) if startup.committed || crate::commands::engine::is_canonical(&error) => {
            return failure(&root, args, &options, &startup, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("lane history restoration: {error}"))),
    };
    workspace_command::checkout_lifecycle::before(&startup)?;
    if options.json {
        workspace_command::execute_json(&root, args, options.command(), |output| {
            session.run(&root, args, &options, startup, output)
        })
    } else {
        workspace_command::execute_then(&root, args, options.command(), |output| {
            session.run(&root, args, &options, startup, output)
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

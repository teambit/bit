//! Render a failed inventory after a resolver callback or remote request owns the command.
use super::{Chalk, Options, Outcome, Session, workspace_command};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub(super) fn owned(
    root: Option<&Path>,
    args: &[OsString],
    options: &Options,
    session: &Session,
    error: io::Error,
) -> io::Result<Outcome> {
    if let Some(root) = root {
        return workspace(root, args, options, session, error);
    }
    bare(args, options, session, &error)
}

fn workspace(
    root: &Path,
    args: &[OsString],
    options: &Options,
    session: &Session,
    error: io::Error,
) -> io::Result<Outcome> {
    let render =
        |output: &bit_install::output::Output| -> io::Result<workspace_command::results::Report> {
            if !options.json {
                output.status(if options.remote.is_some() {
                    "listing remote components"
                } else {
                    "listing components"
                });
            }
            write_session(args, session, output)?;
            Err(error)
        };
    if options.json {
        workspace_command::execute_json(root, args, "list", render)
    } else {
        workspace_command::execute_then(root, args, "list", render)
    }
}

fn bare(
    args: &[OsString],
    options: &Options,
    session: &Session,
    error: &io::Error,
) -> io::Result<Outcome> {
    let output = workspace_command::loader_output(Chalk::detect(args), options.json);
    if !options.json {
        output.restart(r#"running command "list"..."#);
        output.status("listing remote components");
    }
    write_session(args, session, &output)?;
    output.stop();
    eprintln!("{}", Chalk::detect(args).red(&error.to_string()));
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

fn write_session(
    args: &[OsString],
    session: &Session,
    output: &bit_install::output::Output,
) -> io::Result<()> {
    io::stdout()
        .lock()
        .write_all(session.output().as_bytes())?;
    if let Some(warning) = session.warning() {
        output.console(&Chalk::detect(args).red(warning));
    }
    Ok(())
}

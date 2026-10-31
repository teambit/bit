//! Render a failed inventory after a resolver callback or remote request owns the command.
use super::{
    Chalk, History, Options, Outcome, Row, Session, json_report, report, table, workspace_command,
};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

const REMOTE_LOCAL_CONFLICT_ERR: &str =
    "The --local-scope and --scope flags cannot be used when listing a remote scope.";

pub(super) fn preflight(
    cwd: &Path,
    root: Option<&Path>,
    args: &[OsString],
    options: &Options,
) -> Option<io::Result<Outcome>> {
    if ci_enabled() {
        return None;
    }
    if options.remote.is_some() && (options.local_scope || options.scope.is_some()) {
        return Some(emit_error(cwd, root, args, options.json, REMOTE_LOCAL_CONFLICT_ERR));
    }
    None
}

fn ci_enabled() -> bool {
    std::env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}

fn emit_error(
    cwd: &Path,
    root: Option<&Path>,
    args: &[OsString],
    json: bool,
    msg: &'static str,
) -> io::Result<Outcome> {
    if let Some(root) = root {
        if json {
            return workspace_command::execute_json(root, args, "list", |_| {
                Err(io::Error::other(msg))
            });
        }
        return workspace_command::execute_then(root, args, "list", |_| Err(io::Error::other(msg)));
    }
    workspace_command::execute_failure_scope(cwd, args, "list", json, "", io::Error::other(msg))
}

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
    if let Some(warning) = session
        .warning()
        .map(str::trim)
        .filter(|warn| !warn.is_empty())
    {
        output.console(&Chalk::detect(args).red(warning));
    }
    Ok(())
}

pub(super) fn present(
    root: Option<&Path>,
    args: &[OsString],
    rows: &[Row],
    options: &Options,
    session: &Session,
) -> io::Result<Outcome> {
    if options.json {
        return json_output(root, args, rows, options.ids, session);
    }
    let report = workspace_command::results::Report {
        data: report(rows, options, Chalk::detect(args), table::colors(args)),
        code: 0,
        details: None,
    };
    let status =
        if options.remote.is_some() { "listing remote components" } else { "listing components" };
    if let Some(root) = root {
        workspace_command::execute_with(root, args, "list", &report, |output| {
            output.status(status);
            write_session(args, session, output)
        })
    } else {
        let output = workspace_command::loader_output(Chalk::detect(args), false);
        output.restart(r#"running command "list"..."#);
        output.status(status);
        write_session(args, session, &output)?;
        output.stop();
        writeln!(io::stdout().lock(), "{}", report.data)?;
        Ok(Outcome::Exit(ExitCode::SUCCESS))
    }
}

fn json_output(
    root: Option<&Path>,
    args: &[OsString],
    rows: &[Row],
    ids: bool,
    session: &Session,
) -> io::Result<Outcome> {
    let history = root.map(|root| History::start(root, args));
    // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
    let mut stdout = io::stdout().lock();
    stdout.write_all(session.output().as_bytes())?;
    if let Some(warning) = session
        .warning()
        .map(str::trim)
        .filter(|warn| !warn.is_empty())
    {
        writeln!(stdout, "{}", Chalk::detect(args).red(warning))?;
    }
    stdout.write_all(serde_json::to_string_pretty(&json_report(rows, ids))?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

//! Command-owned publication, report output, and history after preflight.
pub(in crate::commands) use error::print as print_error;
pub use error::with_error_details;
mod error;
use super::{Report, cache};
use crate::{commands::color::Chalk, history::History, native::Outcome};
use bit_install::output::Output;
use serde_json::json;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, IsTerminal, Write},
    path::Path,
    process::ExitCode,
    sync::Arc,
};

/// The loader's `running command` line, `work`, then the report; a failure
/// of `work` is the command's own, printed in red with exit code 1.
pub fn execute_with(
    root: &Path,
    args: &[OsString],
    command: &str,
    report: &Report,
    work: impl FnOnce(&Output) -> io::Result<()>,
) -> io::Result<Outcome> {
    execute_then(root, args, command, |output| {
        work(output)?;
        Ok(Report { data: report.data.clone(), code: report.code, details: report.details.clone() })
    })
}

/// Report a lane inspection from a validated bare scope without workspace history.
pub fn execute_with_scope(
    scope: &Path,
    args: &[OsString],
    command: &str,
    report: &Report,
) -> io::Result<Outcome> {
    execute_mode_at(scope, args, command, false, true, |_| {
        Ok(Report { data: report.data.clone(), code: report.code, details: report.details.clone() })
    })
}

/// Run command-owned scope work after starting its loader, without workspace history.
pub fn execute_then_scope(
    scope: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode_at(scope, args, command, false, true, work)
}

/// An owned lane callback error uses the bare scope's loader without workspace history.
pub fn execute_failure_scope(
    scope: &Path,
    args: &[OsString],
    command: &str,
    json: bool,
    callback_output: &str,
    error: io::Error,
) -> io::Result<Outcome> {
    execute_mode_at(scope, args, command, json, !json, |_| {
        io::stdout().lock().write_all(callback_output.as_bytes())?;
        Err(error)
    })
}

/// [`execute_with`] for a command whose report depends on its work.
pub fn execute_then(
    root: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode(root, args, command, false, true, work)
}

/// `CommandRunner.runJsonHandler`: no loader or console output before the JSON report.
pub fn execute_json(
    root: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode(root, args, command, true, false, work)
}

/// A bare-scope JSON handler owns its effects without writing workspace command history.
pub fn execute_json_scope(
    scope: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode_at(scope, args, command, true, false, work)
}

/// A text command whose registry has no loader; callback console output remains visible.
pub fn execute_without_loader(
    root: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode(root, args, command, true, true, work)
}

/// A bare-scope text command whose registry has no loader.
pub fn execute_without_loader_scope(
    scope: &Path,
    args: &[OsString],
    command: &str,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode_at(scope, args, command, true, true, work)
}

fn execute_mode(
    root: &Path,
    args: &[OsString],
    command: &str,
    quiet: bool,
    newline: bool,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode_impl(root, None, args, command, quiet, newline, work)
}

fn execute_mode_at(
    scope: &Path,
    args: &[OsString],
    command: &str,
    quiet: bool,
    newline: bool,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    execute_mode_impl(scope, Some(scope), args, command, quiet, newline, work)
}

fn execute_mode_impl(
    root: &Path,
    scope: Option<&Path>,
    args: &[OsString],
    command: &str,
    quiet: bool,
    newline: bool,
    work: impl FnOnce(&Output) -> io::Result<Report>,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let history = scope.is_none().then(|| History::start(root, args));
    let output = loader_output(chalk, quiet);
    output.restart(&format!(r#"running command "{command}"..."#));
    let report = match work(&output) {
        Ok(report) => {
            if matches!(command, "checkout" | "revert" | "switch" | "import") {
                super::super::status::cleanup_temporary(root)?;
            }
            report
        }
        Err(error) => {
            output.stop();
            if let Some(history) = &history {
                history.end(false);
            }
            self::error::print(&error, chalk);
            return Ok(Outcome::Exit(ExitCode::FAILURE));
        }
    };
    output.stop();
    print(&report, command, newline)?;
    if let Some(history) = &history {
        history.end(report.code == 0);
    }
    Ok(Outcome::Exit(ExitCode::from(u8::try_from(report.code).unwrap_or(1))))
}

/// Bit's loader on stdout: ora draws a spinner on an interactive terminal
/// and prints plain lines elsewhere; `BIT_DISABLE_SPINNER` turns it off.
pub(in crate::commands) fn loader_output(chalk: Chalk, quiet: bool) -> Output {
    let interactive = io::stdout().is_terminal()
        && env::var("TERM").map_or(true, |term| term != "dumb")
        && env::var_os("CI").is_none();
    let disabled = env::var("BIT_DISABLE_SPINNER")
        .is_ok_and(|value| {
            matches!(
                value
                    .trim()
                    .to_ascii_lowercase()
                    .as_str(),
                "true" | "1" | "yes" | "y" | "on",
            )
        });
    let sink: bit_install::output::Sink = Arc::new(move |text: &str| {
        if quiet {
            return;
        }
        let mut stdout = io::stdout().lock();
        let _ = stdout.write_all(text.as_bytes());
        let _ = stdout.flush();
    });
    // `logger.setStatusLine` prints nothing while `process.env.CI` is set.
    let ci = env::var_os("CI").is_some_and(|ci| !ci.is_empty());
    Output::new(chalk.enabled(), interactive, !disabled && !quiet, sink)
        .with_ci(ci)
        .with_console(!quiet && !disabled)
}

/// `runReportHandler`: the report and a newline; details are kept for `bit details`.
fn print(report: &Report, command: &str, newline: bool) -> io::Result<()> {
    if let Some(details) = &report.details {
        let _ = persist_details(details, command);
    }
    let mut stdout = io::stdout().lock();
    stdout.write_all(report.data.as_bytes())?;
    if newline && !(command == "test" && report.data.is_empty()) {
        stdout.write_all(b"\n")?;
    }
    stdout.flush()
}

/// `persistDetails`: `<CACHE_ROOT>/last-command-details/{content,meta.json}`.
fn persist_details(details: &str, command: &str) -> io::Result<()> {
    let dir = cache::cache_root().join("last-command-details");
    fs::create_dir_all(&dir)?;
    let meta = json!({ "command": command, "timestamp": crate::history::iso_now() });
    fs::write(dir.join("content"), details)?;
    fs::write(dir.join("meta.json"), serde_json::to_string(&meta)?)
}

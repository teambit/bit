//! Rust tester selection, loader effects and JSON reports around external Jest.
mod assets;
mod config;
mod coverage;
mod files;
mod junit;
mod multi;
mod paths;
mod plan;
mod report;
mod settings;
mod summary;
mod text_summary;
mod tool;

use super::Options;
use crate::{commands::workspace_command, history::History, native::Outcome};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, time::Instant};

struct Execution {
    report: workspace_command::results::Report,
    terminated: bool,
}

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let started = Instant::now();
    let mut plan = match plan::Plan::prepare(root, args, options) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("tester preparation: {error}"))),
    };
    let history = History::start(root, args);
    let work =
        move |output: &bit_install::output::Output| match plan.run(root, output, !options.json) {
            Ok(execution) => {
                if !execution.terminated {
                    history.end(execution.report.code == 0);
                }
                format_execution(execution, options, args, started)
            }
            Err(error) => {
                history.end(false);
                Err(error)
            }
        };
    if options.json {
        workspace_command::execute_json_scope(root, args, "test", work)
    } else {
        workspace_command::execute_then_scope(root, args, "test", work)
    }
}
fn format_execution(
    execution: Execution,
    options: &Options,
    args: &[OsString],
    started: Instant,
) -> io::Result<workspace_command::results::Report> {
    let mut report = execution.report;
    if !options.json && !execution.terminated {
        let value = serde_json::from_str(&report.data)?;
        report.data = text_summary::format_summary(
            &value,
            report.code,
            started.elapsed().as_millis(),
            crate::commands::color::Chalk::detect(args),
        );
    }
    Ok(report)
}
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}

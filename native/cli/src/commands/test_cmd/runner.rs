//! Rust tester selection, loader effects and JSON reports around external Jest.
mod assets;
mod config;
mod coverage;
mod files;
mod paths;
mod plan;
mod report;
mod settings;
mod summary;
mod tool;

use super::Options;
use crate::{commands::workspace_command, history::History, native::Outcome};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

struct Execution {
    report: workspace_command::results::Report,
    terminated: bool,
}

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let mut plan = match plan::Plan::prepare(root, args, options) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("tester preparation: {error}"))),
    };
    let history = History::start(root, args);
    workspace_command::execute_json_scope(root, args, "test", move |_| match plan.run(root) {
        Ok(execution) => {
            if !execution.terminated {
                history.end(execution.report.code == 0);
            }
            Ok(execution.report)
        }
        Err(error) => {
            history.end(false);
            Err(error)
        }
    })
}
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}

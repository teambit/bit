//! Native linter selection, cache publication, fixes and reports around external `ESLint`.
mod config;
mod plan;
mod report;
mod results;
mod tool;
use super::Options;
use crate::{commands::workspace_command, native::Outcome};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, time::Instant};

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let started = Instant::now();
    let mut plan = match plan::Plan::prepare(root, args, options) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("linter preparation: {error}"))),
    };
    let work = |output: &bit_install::output::Output| {
        let result = plan.run(root, output, options.fix)?;
        let elapsed = u64::try_from(started.elapsed().as_millis()).map_err(io::Error::other)?;
        report::create(&result, &plan.loaded.progress, args, options.json, elapsed)
    };
    if options.json {
        workspace_command::execute_json(root, args, "lint", work)
    } else {
        workspace_command::execute_then(root, args, "lint", work)
    }
}

fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}

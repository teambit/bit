//! Native linter selection, cache publication, fixes and reports around external `ESLint`.
//!
//! [`run`] coordinates [`plan`], [`config`], [`tool`], [`results`], and [`report`] for [`Options`].
mod config;
mod plan;
mod report;
mod results;
mod tool;
use super::Options;
use crate::{commands::workspace_command, native::Outcome};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, time::Instant};

/// Prepares and runs workspace component linting via [`plan::Plan`] and formats the resulting report.
pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let started = Instant::now();
    let mut plan = match plan::Plan::prepare(root, args, options) {
        Ok(plan) => plan,
        Err(error) => {
            let reason = error.to_string();
            return Ok(Outcome::Declined(format!("linter preparation: {}", reason.trim())));
        }
    };
    let fix = options.fix;
    let json = options.json;
    let work = |output: &bit_install::output::Output| {
        let result = plan.run(root, output, fix)?;
        let elapsed = elapsed_millis(&started);
        report::create(&result, &plan.loaded.progress, args, json, elapsed)
    };
    if json {
        workspace_command::execute_json(root, args, "lint", work)
    } else {
        workspace_command::execute_then(root, args, "lint", work)
    }
}

/// Returns the elapsed wall-clock milliseconds since `started`, saturating at `u64::MAX`.
#[inline]
fn elapsed_millis(started: &Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[inline]
fn invalid(message: &'static str) -> io::Error {
    let trimmed = message.trim();
    io::Error::other(if trimmed.is_empty() { "linter failure" } else { trimmed })
}

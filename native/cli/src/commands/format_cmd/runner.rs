//! Rust owns built-in formatting selection and reports; Prettier is an external tool.
mod progress;
mod report;
mod tool;
mod write;
use super::Options;
use crate::{commands::workspace_command, native::Outcome};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path, time::Instant};
use workspace_command::component_service::{Loaded, Selection};

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let started = Instant::now();
    let selection = Selection {
        pattern: options.pattern.clone(),
        changed: options.changed,
        allow_cached_pair: options.check && options.json,
        single_file_write: !options.check,
        ..Selection::default()
    };
    let mut loaded = match Loaded::prepare(root, &selection) {
        Ok(loaded) => loaded,
        Err(error) => return Ok(Outcome::Declined(format!("formatter load: {error}"))),
    };
    let files = match tool::format(&loaded.files) {
        Ok(files) => files,
        Err(error) => return Ok(Outcome::Declined(format!("formatter tool: {error}"))),
    };
    let mut result = loaded.result(&files)?;
    write::validate(&loaded.files)?;
    let work = |output: &bit_install::output::Output| {
        loaded.commit(root)?;
        loaded.progress.print(output);
        if !options.check
            && let Some(error) = write::publish(&loaded.files, &files)?
        {
            output.failure(&write::message(&loaded.progress.environment, &error)?);
            result = json!({"results":[],"errors":[error]});
        }
        report::create(&result, &loaded.progress, args, options, started.elapsed().as_secs_f64())
    };
    if options.json {
        workspace_command::execute_json(root, args, "format", work)
    } else {
        workspace_command::execute_then(root, args, "format", work)
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}

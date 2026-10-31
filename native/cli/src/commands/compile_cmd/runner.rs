//! Rust owns component compilation orchestration; TypeScript is an external compiler.
mod emission;
mod limits;
mod linking;
mod plan;
mod report;
mod tool;
mod write;
use super::Options;
use crate::{commands::workspace_command, native::Outcome};
use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    time::Instant,
};

struct Emitted {
    path: PathBuf,
    content: String,
}
struct Diagnostic {
    path: PathBuf,
    message: String,
}
struct Compiled {
    identity: String,
    files: Vec<Emitted>,
    errors: Vec<Diagnostic>,
}

pub(super) fn try_run(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if root.as_os_str().is_empty() || !root.is_dir() {
        return Ok(None);
    }
    let started = Instant::now();
    let mut plan = match plan::Plan::prepare(root, options) {
        Ok(plan) => plan,
        Err(error) => return Ok(Some(Outcome::Declined(format!("compiler preparation: {error}")))),
    };
    let work = |output: &bit_install::output::Output| {
        plan.run(root, options, output).map_err(|error| format_compile_error(&error, args))?;
        report::create(&plan.compiled, options, args, started.elapsed())
    };
    let outcome = if options.json {
        workspace_command::execute_json(root, args, "compile", work)
    } else {
        workspace_command::execute_then(root, args, "compile", work)
    }?;
    Ok(Some(outcome))
}

fn format_compile_error(error: &io::Error, args: &[OsString]) -> io::Error {
    workspace_command::filesystem_error::report(error, crate::commands::color::Chalk::detect(args))
}

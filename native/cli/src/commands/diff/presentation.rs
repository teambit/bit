//! CLI presentation after native diff preflight.

use super::{Prepared, capture, options, progress};
use crate::{
    commands::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
};
use serde_json::Value;
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
};

pub(super) fn run_report(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    result: &Value,
    prepared: &mut Prepared,
) -> io::Result<Outcome> {
    let data = super::report::format(result, Chalk::detect(args), options)?;
    let report = Report { data, code: 0, details: None };
    prepared.commit(root)?;
    io::stdout().write_all(capture::callback_startup_stdout(&prepared.capture).as_bytes())?;
    workspace_command::execute_with(root, args, "diff", &report, |output| {
        for count in &prepared.selector_loads {
            output.status(&format!("loading {count} component(s)"));
        }
        progress::render_progress(output, root, options, result, prepared.loaded);
        output.raw(&capture::callback_load_stdout(&prepared.capture));
        Ok(())
    })
}

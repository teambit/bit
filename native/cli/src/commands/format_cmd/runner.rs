//! Rust owns built-in formatting selection and reports; Prettier is an external tool.
mod progress;
mod report;
mod tool;
mod write;
use super::Options;
use crate::{commands::workspace_command, native::Outcome};
use serde_json::Value;
use std::{ffi::OsString, io, path::Path, time::Instant};
use workspace_command::component_service::{Loaded, Selection};

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let started = Instant::now();
    let selection = Selection {
        pattern: options.pattern.clone(),
        changed: options.changed,
        allow_cached_pair: options.check && options.json,
        ..Selection::default()
    };
    let mut loaded = match Loaded::prepare(root, &selection) {
        Ok(loaded) => loaded,
        Err(error) => return Ok(Outcome::Declined(format!("formatter load: {error}"))),
    };
    let components = loaded.components()?;
    let files = match tool::format(&loaded.files) {
        Ok(files) => files,
        Err(error) => return Ok(Outcome::Declined(format!("formatter tool: {error}"))),
    };
    if !supported_writes(options.check, &components, &files) {
        return Ok(Outcome::Declined("formatter concurrent source writes".to_owned()));
    }
    let mut result = loaded.result(&files)?;
    write::validate(&loaded.files)?;
    let work = |output: &bit_install::output::Output| {
        loaded.commit(root)?;
        write::apply(options.check, output, &loaded, &components, &files, &mut result)?;
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

fn supported_writes(
    check: bool,
    components: &[workspace_command::component_service::Component],
    files: &[Value],
) -> bool {
    if check {
        return true;
    }
    if components.len() > 2 {
        return false;
    }
    let mut offset = 0;
    for component in components {
        let end = offset + component.files.len();
        let Some(rows) = files.get(offset..end) else {
            return false;
        };
        if rows
            .iter()
            .filter(|row| {
                row["newContent"]
                    .as_str()
                    .is_some_and(|content| !content.is_empty())
            })
            .count()
            > 1
        {
            return false;
        }
        offset = end;
    }
    offset == files.len()
}

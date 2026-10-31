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
    if !supported_writes(options.check, &components, &loaded.files, &files) {
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
    inputs: &[Value],
    files: &[Value],
) -> bool {
    if check {
        return true;
    }
    let mut offset = 0usize;
    for component in components {
        let Some(end) = offset.checked_add(component.files.len()) else {
            return false;
        };
        let (Some(in_rows), Some(out_rows)) = (inputs.get(offset..end), files.get(offset..end))
        else {
            return false;
        };
        if !component_writes_supported(in_rows, out_rows) {
            return false;
        }
        offset = end;
    }
    offset == files.len() && offset == inputs.len()
}

fn component_writes_supported(inputs: &[Value], outputs: &[Value]) -> bool {
    let changed = inputs
        .iter()
        .zip(outputs)
        .filter(|(_, out)| {
            out["newContent"]
                .as_str()
                .is_some_and(|content| !content.is_empty())
        })
        .collect::<Vec<_>>();
    if changed.len() <= 1 {
        return true;
    }
    changed
        .into_iter()
        .all(|(input, _)| {
            input["absolutePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .is_some_and(|path| {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .open(path)
                        .is_ok()
                })
        })
}

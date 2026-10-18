//! Pre-effect declines stop before providers; later failures belong to the retained import.
use super::{Planned, lifecycle::Lifecycle, options::Options, output, patterns};
use crate::{
    commands::{color::Chalk, workspace_command::results::Report},
    native::Outcome,
};
use std::{ffi::OsString, io, path::Path, time::Instant};

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    if let Err(error) = super::preparation::local_preflight(root, options) {
        return Ok(Outcome::Declined(format!("import: {error}")));
    }
    let required = match Lifecycle::required(root, options) {
        Ok(required) => required,
        Err(error) => return Ok(Outcome::Declined(format!("import: {error}"))),
    };
    let mut lifecycle = Lifecycle::bootstrap(root, args, options, required)?;
    print!("{}", lifecycle.take_stdout());
    if let Some(error) = options.validation_error() {
        return output::execute(root, args, options, |_| Err(io::Error::other(error)));
    }
    let chalk = Chalk::detect(args);
    let selected = patterns::select(root, options);
    let selection = match selected {
        Ok(selection) => selection,
        Err(error) => return failure(root, args, options, lifecycle.started(), error),
    };
    if selection.ids.is_empty() && !options.ids.is_empty() {
        return output::empty(root, args, options, &selection, chalk);
    }
    execute_selected(root, args, options, lifecycle, chalk, &selection)
}
fn execute_selected(
    root: &Path,
    args: &[OsString],
    options: &Options,
    mut lifecycle: Lifecycle,
    chalk: Chalk,
    selection: &patterns::Selection,
) -> io::Result<Outcome> {
    if options.selection.dependents.active() {
        return output::execute(root, args, options, |output| {
            let started = Instant::now();
            output::selection(options, selection, output);
            let mut planned =
                Planned::plan_graph(root, options, &selection.ids, chalk, &mut lifecycle, output)?;
            complete(root, options, output, started, &mut lifecycle, &mut planned)
        });
    }
    let planned = Planned::plan(root, options, &selection.ids, chalk);
    let mut planned = match planned {
        Ok(planned) => planned,
        Err(error) => return failure(root, args, options, lifecycle.started(), error),
    };
    output::execute(root, args, options, |output| {
        let started = Instant::now();
        output::selection(options, selection, output);
        complete(root, options, output, started, &mut lifecycle, &mut planned)
    })
}
fn complete(
    root: &Path,
    options: &Options,
    output: &bit_install::output::Output,
    started: Instant,
    lifecycle: &mut Lifecycle,
    planned: &mut Planned,
) -> io::Result<Report> {
    let advanced = options.selection.dependents.active()
        || options.write.adoption.track_only
        || options.write.adoption.write_to_empty_dir
        || options.write.adoption.write_deps.is_some();
    if advanced {
        super::render_progress(planned, options, output);
    }
    for warning in planned.prepared["directoryWarnings"]
        .as_array()
        .into_iter()
        .flatten()
    {
        output.warning(
            warning.as_str().ok_or_else(|| io::Error::other("native import directory warning"))?,
        );
    }
    lifecycle.before_apply()?;
    let applied = planned.apply()?;
    lifecycle.acknowledge(root, &applied)?;
    if applied["requiresWriteDependencies"] == true {
        planned.write_dependencies(root, options, lifecycle)?;
    }
    lifecycle.render(root, planned, options, output, started, advanced)?;
    Ok(Report { data: planned.report.clone(), code: 0, details: None })
}
fn failure(
    root: &Path,
    args: &[OsString],
    options: &Options,
    owned: bool,
    error: io::Error,
) -> io::Result<Outcome> {
    if owned {
        return output::execute(root, args, options, |_| Err(error));
    }
    Ok(Outcome::Declined(format!("{}: {error}", options.operation)))
}

//! One authoritative merge capture, local publication, installation, then snapshot callbacks.
mod snapshot;
use super::report;
use crate::{
    commands::{
        color::Chalk,
        installation::Installer,
        status::{autosync::Startup, js::decline},
        workspace_command::{
            self, Planned, Request, checkout_lifecycle, progress::Progress, resolve,
            results::Report,
        },
    },
    native::Outcome,
};
use bit_install::output::Output;
use serde_json::Value;
use std::{ffi::OsString, io, path::Path};

pub(in crate::commands) struct Options {
    pub request: Value,
    pub mode: report::Mode,
    pub message: Option<String>,
    pub skip_install: bool,
    pub workflow: resolve::workflow::Workflow,
}

pub(in crate::commands) fn workflow<'a>(
    args: &[&'a str],
) -> Option<(resolve::workflow::Workflow, Vec<&'a str>)> {
    let count = args
        .iter()
        .filter(|arg| **arg == "--build")
        .count();
    if count > 1 {
        return None;
    }
    let mut workflow = resolve::workflow::Workflow::default();
    workflow.build = count == 1;
    Some((
        workflow,
        args.iter()
            .copied()
            .filter(|arg| *arg != "--build")
            .collect(),
    ))
}

pub(in crate::commands) fn run(
    root: &Path,
    args: &[OsString],
    argv: &[&str],
    mut options: Options,
) -> io::Result<Outcome> {
    options.workflow.configure(root, argv, resolve::Kind::Resolve)?;
    let installer = match super::install::start(root, argv, options.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("merge installation: {error}"))),
    };
    let mut startup = Startup::default();
    let request = Request {
        operation: "merge",
        options: options.request.clone(),
        to: None,
        verify_fresh: true,
    };
    let prepared = workspace_command::plan_merge(root, &request, &mut startup)
        .and_then(|planned| {
            super::failures::check(
                &planned.plan["result"],
                Chalk::detect(args),
                options.mode.lane,
            )?;
            Progress::parse(planned.plan.get("progress"))?;
            report::format(&planned.plan["result"], options.mode, Chalk::detect(args))?;
            Ok(planned)
        });
    let planned = match prepared {
        Ok(planned) => planned,
        Err(error) if startup.committed || crate::commands::engine::is_canonical(&error) => {
            return checkout_lifecycle::failure(root, args, "merge", &startup, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("merge: {error}"))),
    };
    if !options.mode.lane {
        checkout_lifecycle::before(&startup)?;
    }
    workspace_command::execute_then(root, args, "merge", |output| {
        execute(root, args, output, planned, &startup, &options, installer)
    })
}

fn execute(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut planned: Planned,
    startup: &Startup,
    options: &Options,
    installer: Option<Installer>,
) -> io::Result<Report> {
    if let Some(progress) = Progress::parse(planned.plan.get("progress"))? {
        if options.mode.lane {
            progress.render_merge_startup(output, &startup.stdout, &startup.build_stdout);
        } else {
            checkout_lifecycle::loaded(startup);
            progress.render_merge(output);
        }
    }
    workspace_command::commit(&mut planned, root)?;
    let conflicts = planned.plan["result"]["leftUnresolvedConflicts"] == true
        || planned.plan["result"]["configMergeResults"]
            .as_array()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|row| row["hasConflicts"] == true)
            });
    if !conflicts
        && let Some(installer) = installer
        && let Err(error) = installer.install_merge(root)
    {
        output.failure(&format!(
            "failed installing packages, see the log for full stacktrace. error: {error}",
        ));
    }
    let mut result = planned.plan["result"].clone();
    let seeds = planned.plan["mergeSnapshotSeeds"]
        .as_array()
        .ok_or_else(|| decline("merge snapshot identities"))?;
    if !conflicts && !seeds.is_empty() {
        snapshot::run(root, output, &mut planned, &mut result, options)?;
    }
    crate::commands::status::cleanup_temporary(root)?;
    report::format(&result, options.mode, Chalk::detect(args))
}

//! Native `bit checkout <to> [component-pattern]`, a workspace command
//! (`workspace_command`) with the checkout options and report.

pub(super) mod options;
pub(super) mod report;

use super::{
    color::Chalk,
    installation::{self, Installer},
    workspace_command::{
        self, Planned, Request, format::Formatter, progress::Progress, results::Report,
    },
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "checkout", aliases: &["U"], run };
pub const REVERT: Command = Command { name: "revert", aliases: &[], run: run_revert };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native checkout grammar".to_string()));
    };
    run_options(args, &argv, &options)
}

fn run_revert(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse_revert(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native revert grammar".to_string()));
    };
    run_options(args, &argv, &options)
}

fn run_options(
    args: &[OsString],
    argv: &[&str],
    options: &options::Options,
) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let installer = match start_installer(&root, argv, options.execution.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("checkout installation: {error}"))),
    };
    let prepared = match prepare(&root, args, options) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("checkout: {error}"))),
    };
    execute(&root, args, if options.revert { "revert" } else { "checkout" }, prepared, installer)
}

fn start_installer(root: &Path, argv: &[&str], skip: bool) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

struct PreparedCheckout {
    planned: Planned,
    report: Report,
    progress: Option<Progress>,
    ids: Vec<String>,
    conflicts: bool,
    main: bool,
}

fn prepare(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
) -> io::Result<PreparedCheckout> {
    let request = Request {
        operation: "checkout",
        options: options.request(),
        to: Some(&options.to),
        verify_fresh: false,
    };
    let planned = workspace_command::plan(root, &request)?;
    let report = report::format(&planned.plan["result"], options, Chalk::detect(args))?;
    let progress = Progress::parse(planned.plan.get("progress"))?;
    let ids = if options.to == "reset" {
        installation::changed_component_ids(&planned.plan["result"])?
    } else {
        installation::component_ids(&planned.plan["result"])?
    };
    let conflicts = planned.plan["result"]["leftUnresolvedConflicts"] == true;
    Ok(PreparedCheckout { planned, report, progress, ids, conflicts, main: options.to == "main" })
}

fn execute(
    root: &Path,
    args: &[OsString],
    command: &str,
    prepared: PreparedCheckout,
    installer: Option<Installer>,
) -> io::Result<Outcome> {
    if let Some(installer) = installer {
        return workspace_command::execute_then(root, args, command, |output| {
            install_and_report(root, args, output, prepared, installer)
        });
    }
    workspace_command::execute(root, args, command, prepared.planned, &prepared.report, |output| {
        render_progress(output, prepared.progress.as_ref(), prepared.main);
    })
}

fn install_and_report(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: PreparedCheckout,
    installer: Installer,
) -> io::Result<Report> {
    render_progress(output, prepared.progress.as_ref(), prepared.main);
    workspace_command::commit(&mut prepared.planned, root)?;
    if !prepared.conflicts
        && !prepared.ids.is_empty()
        && let Err(error) = installer.install(root, false, &prepared.ids)
    {
        output.failure(&format!("installation failed with the following error: {error}"));
        prepared.report.data = Formatter::join(&[
            prepared.report.data,
            installation::error_report(Chalk::detect(args), &error.to_string()),
        ]);
    }
    Ok(prepared.report)
}

fn render_progress(output: &Output, progress: Option<&Progress>, main: bool) {
    if let Some(progress) = progress {
        progress.render_checkout_with(output, main);
    }
}

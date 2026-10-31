//! Native `bit checkout <to> [component-pattern]`, a workspace command
//! (`workspace_command`) with the checkout options and report.

pub(super) mod options;
pub(super) mod report;

use super::{
    add::ProjectedLinker,
    color::Chalk,
    installation::{self, Installer},
    status::environments::Environments,
    workspace_command::{
        self, Planned, Request, format::Formatter, progress::Progress, results::Report,
    },
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::{HostInfo, output::Output};
use std::{env, ffi::OsString, io, path::Path, sync::Arc};

pub const COMMAND: Command = Command { name: "checkout", aliases: &["U"], run };
pub const REVERT: Command = Command { name: "revert", aliases: &[], run: run_revert };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return fallback_checkout_error(args, &argv[1..]);
    };
    run_options(args, &argv, &options)
}

fn fallback_checkout_error(args: &[OsString], raw_args: &[&str]) -> io::Result<Outcome> {
    let Some(err_msg) = options::validate_error(raw_args) else {
        return Ok(Outcome::Declined("outside the native checkout grammar".to_string()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI checkout option validation".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    workspace_command::execute_then(&root, args, "checkout", |_| Err(io::Error::other(err_msg)))
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
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if options.revert && env::var_os("CI").is_none_or(|val| val.is_empty()) {
            return workspace_command::execute_then_scope(&cwd, args, "revert", |output| {
                output.status("reverting components...");
                Err(io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR))
            });
        }
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let command = if options.revert { "revert" } else { "checkout" };
    let installer = match start_installer(&root, argv, options.execution.skip_install) {
        Ok(installer) => installer,
        Err(error) => return Ok(Outcome::Declined(format!("checkout installation: {error}"))),
    };
    let (environment, installation) = installation_session(installer)?;
    let mut startup = super::status::autosync::Startup::default();
    let prepared = match prepare(&root, args, options, &mut startup, environment) {
        Ok(prepared) => prepared,
        Err(error) if startup.committed || super::engine::is_canonical(&error) => {
            return workspace_command::checkout_lifecycle::failure(
                &root, args, command, &startup, error,
            );
        }
        Err(error) => return Ok(Outcome::Declined(format!("checkout: {error}"))),
    };
    execute(&root, args, command, prepared, installation)
}

fn start_installer(root: &Path, argv: &[&str], skip: bool) -> io::Result<Option<Installer>> {
    if skip { Ok(None) } else { Installer::start(root, argv).map(Some) }
}

fn installation_session(
    installer: Option<Installer>,
) -> io::Result<(Option<Environments>, Option<HostInfo>)> {
    match installer {
        Some(installer) => {
            let (environment, info) = installer.into_parts()?;
            Ok((Some(environment), Some(info)))
        }
        None => Ok((None, None)),
    }
}

struct PreparedCheckout {
    startup: super::status::autosync::Startup,
    planned: Planned,
    report: Report,
    progress: Option<Progress>,
    ids: Vec<String>,
    conflicts: bool,
    main: bool,
    revert: bool,
}

fn prepare(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    startup: &mut super::status::autosync::Startup,
    environment: Option<Environments>,
) -> io::Result<PreparedCheckout> {
    if options.to.trim().is_empty() {
        return Err(io::Error::other("checkout target version is empty"));
    }
    let request = Request {
        operation: "checkout",
        options: options.request(),
        to: Some(&options.to),
        verify_fresh: false,
    };
    let planned = match environment {
        Some(environment) => {
            workspace_command::plan_with_environment(root, &request, startup, environment)?
        }
        None => workspace_command::plan_with_startup(root, &request, startup)?,
    };
    let report = report::format(&planned.plan["result"], options, Chalk::detect(args))?;
    let progress = Progress::parse(planned.plan.get("progress"))?;
    let ids = if options.to == "reset" {
        installation::changed_component_ids(&planned.plan["result"])?
    } else {
        installation::component_ids(&planned.plan["result"])?
    };
    let conflicts = planned.plan["result"]["leftUnresolvedConflicts"] == true;
    Ok(PreparedCheckout {
        startup: std::mem::take(startup),
        planned,
        report,
        progress,
        ids,
        conflicts,
        main: options.to == "main",
        revert: options.revert,
    })
}

fn execute(
    root: &Path,
    args: &[OsString],
    command: &str,
    prepared: PreparedCheckout,
    installation: Option<HostInfo>,
) -> io::Result<Outcome> {
    workspace_command::checkout_lifecycle::before(&prepared.startup)?;
    if let Some(info) = installation {
        return workspace_command::execute_then(root, args, command, |output| {
            install_and_report(root, args, output, prepared, info)
        });
    }
    workspace_command::execute(root, args, command, prepared.planned, &prepared.report, |output| {
        render_progress(output, prepared.progress.as_ref(), prepared.main, prepared.revert);
        workspace_command::checkout_lifecycle::loaded(&prepared.startup);
    })
}

fn install_and_report(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: PreparedCheckout,
    mut info: HostInfo,
) -> io::Result<Report> {
    render_progress(output, prepared.progress.as_ref(), prepared.main, prepared.revert);
    workspace_command::checkout_lifecycle::loaded(&prepared.startup);
    workspace_command::commit(&mut prepared.planned, root)?;
    if !prepared.conflicts && !prepared.ids.is_empty() {
        let mut environment = prepared.planned
            .take_environment()
            .ok_or_else(|| io::Error::other("checkout installation provider session"))?;
        print!("{}", ProjectedLinker::project_installation_workspace(root, &mut environment)?);
        let host = environment
            .into_tracking_host()
            .ok_or_else(|| io::Error::other("checkout installation Host"))?;
        info.file_id = workspace_command::file_id();
        let host = Arc::new(host);
        let installer = Installer::from_host(Arc::clone(&host), info)
            .with_initialized_cache(prepared.planned.has_captured_components());
        let installed = installer.install(root, false, &prepared.ids);
        if let Err(error) = &installed {
            output.failure(&format!("installation failed with the following error: {error}"));
        }
        // ComponentWriter.finalizeWrite compiles once after the install call,
        // whether that call succeeded or failed, on its retained class cache.
        host.call("installCanonicalFinalize", &serde_json::json!({}))?;
        print!("{}", host.take_stdout());
        if let Err(error) = installed {
            prepared.report.data = Formatter::join(&[
                prepared.report.data,
                installation::error_report(Chalk::detect(args), &error.to_string()),
            ]);
        }
    }
    Ok(prepared.report)
}

fn render_progress(output: &Output, progress: Option<&Progress>, main: bool, revert: bool) {
    if let Some(progress) = progress {
        progress.render_checkout_with(output, main, revert);
    }
}

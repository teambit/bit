//! One authoritative merge capture, local publication, installation, then snapshot callbacks.
mod snapshot;
use super::report;
use crate::{
    commands::{
        add::ProjectedLinker,
        color::Chalk,
        installation::Installer,
        status::{autosync::Startup, environments::Environments, js::decline},
        workspace_command::{
            self, Planned, Request, checkout_lifecycle, progress::Progress, resolve,
            results::Report,
        },
    },
    native::Outcome,
};
use bit_install::{HostInfo, output::Output};
use serde_json::Value;
use std::{ffi::OsString, io, path::Path, sync::Arc};

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
        .filter(|arg| matches!(arg.trim(), "--build" | "--build=true" | "--build=false"))
        .count();
    if count > 1 {
        return None;
    }
    let mut workflow = resolve::workflow::Workflow::default();
    workflow.build = args
        .iter()
        .any(|arg| matches!(arg.trim(), "--build" | "--build=true"));
    Some((
        workflow,
        args.iter()
            .copied()
            .filter(|arg| !matches!(arg.trim(), "--build" | "--build=true" | "--build=false"))
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
    let (environment, installation) = installation_session(installer)?;
    let mut startup = Startup::default();
    let request = Request {
        operation: "merge",
        options: options.request.clone(),
        to: None,
        verify_fresh: true,
    };
    let planned = match environment {
        Some(environment) => workspace_command::plan_merge_with_environment(
            root,
            &request,
            &mut startup,
            environment,
        ),
        None => workspace_command::plan_merge(root, &request, &mut startup),
    };
    let prepared = planned.and_then(|planned| precheck(planned, args, &options));
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
        execute(root, args, output, planned, &startup, &options, installation)
    })
}

fn precheck(planned: Planned, args: &[OsString], options: &Options) -> io::Result<Planned> {
    super::failures::check(&planned.plan["result"], Chalk::detect(args), options.mode.lane)?;
    Progress::parse(planned.plan.get("progress"))?;
    report::format(&planned.plan["result"], options.mode, Chalk::detect(args))?;
    Ok(planned)
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

fn execute(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut planned: Planned,
    startup: &Startup,
    options: &Options,
    installation: Option<HostInfo>,
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
            })
        || planned.plan["result"]["workspaceConfigUpdateResult"]["workspaceDepsConflicts"]
            .as_object()
            .is_some_and(|map| !map.is_empty());
    if !conflicts
        && let Some(info) = installation
        && let Err(error) = install_retained(root, &mut planned, info)
    {
        output.failure(&format!(
            "failed installing packages, see the log for full stacktrace. error: {}",
            error.to_string().trim(),
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

fn install_retained(root: &Path, planned: &mut Planned, mut info: HostInfo) -> io::Result<()> {
    let mut environment = planned
        .take_environment()
        .ok_or_else(|| io::Error::other("merge installation provider session"))?;
    print!("{}", ProjectedLinker::project_installation_workspace(root, &mut environment)?);
    let component_ids = planned.merge_cache_ids()?;
    print!("{}", environment.merge_load_apps(root, &component_ids)?);
    let host = Arc::new(
        environment
            .into_tracking_host()
            .ok_or_else(|| io::Error::other("merge installation Host"))?,
    );
    info.file_id = workspace_command::file_id();
    let installed = Installer::from_host(Arc::clone(&host), info)
        .with_initialized_cache(planned.has_captured_components())
        .install_merge(root);
    let host = Arc::try_unwrap(host)
        .map_err(|_| io::Error::other("merge installation Host still borrowed"))?;
    planned.restore_host(host);
    installed
}

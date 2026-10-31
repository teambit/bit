//! Native `bit snap [component-pattern]`: the engine plans and writes the
//! snaps (`workspace_command::resolve`), with the snap options and report.

mod options;

use super::{
    color::Chalk,
    status::autosync::Startup,
    workspace_command::{self, Planned, progress::Progress, resolve, results::Report, versions},
};
use crate::{commands::Command, native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
};

pub const COMMAND: Command = Command { name: "snap", aliases: &[], run };

/// The warning `bit snap` prints without `--message`.
const MESSAGE_WARNING: &str = "--message will be mandatory in the next few releases. make sure to add a message with your snap, will be displayed in the version history";

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some((mut workflow, command_args)) =
        resolve::workflow::parse(&argv[1..], resolve::Kind::Snap)
    else {
        return Ok(Outcome::Declined("outside the native snap tooling grammar".to_string()));
    };
    let Some((policy, command_args)) = resolve::policy::parse(&command_args, false) else {
        return Ok(Outcome::Declined("outside the native snapshot policy grammar".to_string()));
    };
    let Some(options) = options::parse(&command_args) else {
        return Ok(Outcome::Declined("outside the native snap grammar".to_string()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_snap(&cwd, args, &options, &workflow);
    };
    workflow.configure(&root, &argv[1..], resolve::Kind::Snap)?;
    run_workspace(&root, args, &options, &workflow, &policy)
}

fn outside_workspace_snap(
    cwd: &Path,
    args: &[OsString],
    options: &options::Options,
    workflow: &resolve::workflow::Workflow,
) -> io::Result<Outcome> {
    if env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty()
                && trimmed != "0"
                && !trimmed.eq_ignore_ascii_case("false")
                && !trimmed.eq_ignore_ascii_case("no")
        })
    {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    }
    let warn = should_warn_message(options, workflow);
    workspace_command::execute_then_scope(cwd, args, "snap", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        Err(io::Error::other(super::log::OUTSIDE_WORKSPACE_ERR))
    })
}

fn should_warn_message(options: &options::Options, workflow: &resolve::workflow::Workflow) -> bool {
    options.message
        .as_deref()
        .is_none_or(|message| message.trim().is_empty())
        && workflow.editor
            .as_deref()
            .is_none_or(|editor| editor.trim().is_empty())
}

fn run_workspace(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    workflow: &resolve::workflow::Workflow,
    policy: &resolve::policy::Policy,
) -> io::Result<Outcome> {
    let mut startup = Startup::default();
    let prepared = prepare(root, args, options, workflow, policy, &mut startup);
    let warn = should_warn_message(options, workflow);
    let (mut planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) if startup.committed => return failure(root, args, warn, &startup, error),
        Err(error) => return Ok(Outcome::Declined(format!("snap: {error}"))),
    };
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(root, args, "snap", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        resolve::render_events(output, &startup)?;
        render_progress(output, progress.as_ref(), !startup.snapshot_events.is_empty());
        resolve::render_build_output(output, &startup, false)?;
        workspace_command::commit(&mut planned, root)?;
        super::status::cleanup_temporary(root)?;
        Ok(report)
    })
}

fn prepare(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    workflow: &resolve::workflow::Workflow,
    policy: &resolve::policy::Policy,
    startup: &mut Startup,
) -> io::Result<(Planned, Report, Option<Progress>)> {
    let mut request_options = options.request();
    policy.apply(&mut request_options);
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Snap,
        options: request_options,
        selection: resolve::Selection::Snap {
            pattern: options.pattern
                .as_deref()
                .map(str::trim)
                .filter(|pat| !pat.is_empty()),
            unmerged: options.unmerged,
        },
    };
    let planned = resolve::plan_snapshot(root, &request, startup, workflow)?;
    let report = versions::format(&planned.plan["result"], Chalk::detect(args), &versions::SNAP)?;
    let progress = Progress::parse_snap(planned.plan.get("progress"))?;
    Ok((planned, report, progress))
}

fn failure(
    root: &Path,
    args: &[OsString],
    warn: bool,
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(root, args, "snap", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        resolve::render_build_output(output, startup, true)?;
        Err(error)
    })
}

fn render_progress(
    output: &bit_install::output::Output,
    progress: Option<&Progress>,
    events: bool,
) {
    if let Some(progress) = progress {
        if events {
            progress.render_graph(output);
        } else {
            progress.render_merge(output);
        }
    }
}

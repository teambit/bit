//! Native `bit tag [component-patterns...]`: the engine plans and writes the
//! tags (`workspace_command::resolve`), with the tag options and report.

mod options;
mod version_file;

use super::{
    color::Chalk,
    workspace_command::{self, Planned, progress::Progress, resolve, results::Report, versions},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use options::{Mode, Options};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "tag", aliases: &["t"], run };

/// The warning `bit tag` prints without `--message`.
const MESSAGE_WARNING: &str = "--message will be mandatory in the next few releases. make sure to add a message with your tag";
/// The warning every tag on `main` prints without `--build`.
const REMOTE_BUILD_WARNING: &str = r#"tagging components on "main" lane when using remote build is not recommended. To avoid SemVer versions of your component with failing builds, please refer to:
- Snap changes in a different lane and merge to "main" on your remote (learn more on lanes - https://bit.dev/reference/lanes/getting-started-with-lanes)
- Use `bit tag --build` to build your components locally.
- Use `snap` or `build` first to validate your build passing, and then version and export safely.

To undo local tag use the "bit reset" command."#;

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some((mut workflow, command_args)) =
        resolve::workflow::parse(&argv[1..], resolve::Kind::Tag)
    else {
        return Ok(Outcome::Declined("outside the native tag tooling grammar".to_string()));
    };
    let Some((policy, command_args)) = resolve::policy::parse(&command_args, true) else {
        return Ok(Outcome::Declined("outside the native snapshot policy grammar".to_string()));
    };
    let Some(options) = options::parse(&command_args) else {
        return Ok(Outcome::Declined("outside the native tag grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    workflow.configure(&root, &argv[1..], resolve::Kind::Tag)?;
    run_workspace(&root, args, &options, &workflow, &policy)
}

fn run_workspace(
    root: &Path,
    args: &[OsString],
    options: &Options,
    workflow: &resolve::workflow::Workflow,
    policy: &resolve::policy::Policy,
) -> io::Result<Outcome> {
    let mut startup = super::status::autosync::Startup::default();
    let prepared = plan_tag(root, args, options, &mut startup, workflow, policy);
    let warn = options.message.is_none()
        && options.mode != Mode::Persist
        && workflow.editor.is_none();
    let (mut planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) if startup.committed => {
            return failure(
                root,
                args,
                warn,
                options.mode == Mode::Soft || workflow.build,
                &startup,
                error,
            );
        }
        Err(error) => return Ok(Outcome::Declined(format!("tag: {error}"))),
    };
    use std::io::Write as _;
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(root, args, "tag", |output| {
        warnings(output, warn, options.mode == Mode::Soft || workflow.build);
        resolve::render_events(output, &startup)?;
        render_progress(
            output,
            progress.as_ref(),
            &options.mode,
            !startup.snapshot_events.is_empty(),
        );
        resolve::render_build_output(output, &startup, false)?;
        workspace_command::commit(&mut planned, root)?;
        super::status::cleanup_temporary(root)?;
        Ok(report)
    })
}

fn plan_tag(
    root: &Path,
    args: &[OsString],
    options: &Options,
    startup: &mut super::status::autosync::Startup,
    workflow: &resolve::workflow::Workflow,
    policy: &resolve::policy::Policy,
) -> io::Result<(Planned, Report, Option<Progress>)> {
    let mut tag_options = options.tag_options();
    if let Some(path) = options.selection.versions_file.as_deref() {
        let file = version_file::read(root, path)?;
        tag_options["versionsFile"] = file.data;
        tag_options["versionsFile"]["path"] = serde_json::json!(path);
        tag_options["versionsFile"]["readProof"] = file.proof;
    }
    let mut request_options = options.request();
    policy.apply(&mut request_options);
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Tag,
        options: request_options,
        selection: resolve::Selection::Tag {
            tag_options,
            patterns: &options.selection.patterns,
            exact_version: options.release.exact_version.as_deref(),
        },
    };
    let planned = resolve::plan_snapshot(root, &request, startup, workflow)?;
    let labels = match options.mode {
        Mode::Soft => &versions::SOFT_TAG,
        Mode::Persist => &versions::PERSIST_TAG,
        Mode::Ordinary => &versions::TAG,
    };
    let report = versions::format(&planned.plan["result"], Chalk::detect(args), labels)?;
    let progress = Progress::parse_snap(planned.plan.get("progress"))?;
    Ok((planned, report, progress))
}

fn render_progress(output: &Output, progress: Option<&Progress>, mode: &Mode, events: bool) {
    if let Some(progress) = progress {
        if events {
            if *mode != Mode::Soft {
                progress.render_graph(output);
            }
        } else if *mode == Mode::Soft {
            progress.render_soft_tag(output);
        } else {
            progress.render_merge(output);
        }
    }
}

/// What `bit tag` prints before the progress lines.
fn warnings(output: &Output, without_message: bool, soft: bool) {
    if without_message {
        output.warning(MESSAGE_WARNING);
    }
    if !soft {
        output.warning(REMOTE_BUILD_WARNING);
    }
    output.status("determine components to tag...");
}

fn failure(
    root: &Path,
    args: &[OsString],
    warn: bool,
    soft: bool,
    startup: &super::status::autosync::Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    use std::io::Write as _;
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(root, args, "tag", |output| {
        warnings(output, warn, soft);
        resolve::render_build_output(output, startup, true)?;
        Err(error)
    })
}

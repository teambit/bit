//! Native `bit tag [component-patterns...]`: the engine plans and writes the
//! tags (`workspace_command::resolve`), with the tag options and report.

mod diagnostics;
mod options;
mod version_file;

use super::{
    color::Chalk,
    workspace_command::{self, Planned, progress::Progress, resolve, results::Report, versions},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_install::output::Output;
use options::{Mode, Options};
use serde_json::{Value, json};
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
    if env::var("BIT_FEATURES")
        .is_ok_and(|features| {
            features
                .split(',')
                .any(|feature| feature.trim() == "flattened-deps-in-source")
        })
    {
        return Ok(Outcome::Declined("flattened-deps-in-source feature toggle".to_string()));
    }
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
        return fallback_parse_error(args, &argv[1..], &command_args, &mut workflow);
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return outside_workspace_tag(&cwd, args, &options, &workflow);
    };
    workflow.configure(&root, &argv[1..], resolve::Kind::Tag)?;
    if let Some(err_msg) = editor_conflict(&options, &workflow)
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return pre_status_failure(&root, args, &options, &workflow, err_msg);
    }
    if let Some(ver) = options.invalid_pattern_version() {
        return invalid_version_failure(&root, args, &options, &workflow, ver);
    }
    run_workspace(&root, args, &options, &workflow, &policy)
}

fn fallback_parse_error(
    args: &[OsString],
    raw_args: &[&str],
    command_args: &[&str],
    workflow: &mut resolve::workflow::Workflow,
) -> io::Result<Outcome> {
    if let Some((warn, err_msg)) = options::validate_error(command_args, workflow.editor.is_some())
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return emit_validate_error(args, warn, &err_msg);
    }
    if let Some((options, ver)) = options::invalid_ver(command_args)
        && let Some(root) = workspace::root(&env::current_dir()?)
    {
        workflow.configure(&root, raw_args, resolve::Kind::Tag)?;
        return invalid_version_failure(&root, args, &options, workflow, &ver);
    }
    Ok(Outcome::Declined("outside the native tag grammar".to_string()))
}

fn emit_validate_error(args: &[OsString], warn: bool, err_msg: &str) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        return workspace_command::execute_then(&root, args, "tag", |output| {
            if warn {
                output.warning(MESSAGE_WARNING);
            }
            Err(io::Error::other(err_msg))
        });
    }
    workspace_command::execute_then_scope(&cwd, args, "tag", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        Err(io::Error::other(err_msg))
    })
}

fn editor_conflict(
    options: &Options,
    workflow: &resolve::workflow::Workflow,
) -> Option<&'static str> {
    workflow.editor.as_ref()?;
    if options.mode == Mode::Persist {
        Some("you can use either --editor or --persist, but not both")
    } else if options.message.is_some() {
        Some("you can use either --editor or --message, but not both")
    } else {
        None
    }
}

fn pre_status_failure(
    root: &Path,
    args: &[OsString],
    options: &Options,
    workflow: &resolve::workflow::Workflow,
    err_msg: &str,
) -> io::Result<Outcome> {
    let warn = options.message.is_none()
        && options.mode != Mode::Persist
        && workflow.editor.is_none();
    let soft = options.mode == Mode::Soft || workflow.build;
    workspace_command::execute_then(root, args, "tag", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        if !soft {
            output.warning(REMOTE_BUILD_WARNING);
        }
        Err(io::Error::other(err_msg))
    })
}

fn outside_workspace_tag(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
    workflow: &resolve::workflow::Workflow,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    }
    let warn = options.message.is_none()
        && options.mode != Mode::Persist
        && workflow.editor.is_none();
    let soft = options.mode == Mode::Soft || workflow.build || options.mode == Mode::Persist;
    let err_msg = editor_conflict(options, workflow).unwrap_or(super::log::OUTSIDE_WORKSPACE_ERR);
    workspace_command::execute_then_scope(cwd, args, "tag", |output| {
        if warn {
            output.warning(MESSAGE_WARNING);
        }
        if !soft {
            output.warning(REMOTE_BUILD_WARNING);
        }
        Err(io::Error::other(err_msg))
    })
}

fn invalid_version_failure(
    root: &Path,
    args: &[OsString],
    options: &Options,
    workflow: &resolve::workflow::Workflow,
    ver: &str,
) -> io::Result<Outcome> {
    let warn = options.message.is_none()
        && options.mode != Mode::Persist
        && workflow.editor.is_none();
    let startup = super::status::autosync::Startup::default();
    let error = io::Error::other(format!(
        "error: version {ver} is not a valid semantic version. learn more: https://semver.org",
    ));
    failure(root, args, warn, options.mode == Mode::Soft || workflow.build, &startup, error)
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
    let soft = options.mode == Mode::Soft || workflow.build;
    let (mut planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) if startup.committed => {
            return failure(root, args, warn, soft, &startup, error);
        }
        Err(error) => {
            if let Ok(Some(diag)) = diagnostics::diagnose(root, args, options, policy, &error) {
                return failure(root, args, warn, soft, &startup, diag);
            }
            return Ok(Outcome::Declined(format!("tag: {error}")));
        }
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

impl Options {
    /// `options` of `commandTagPrepare`, as `JSON.stringify` writes them.
    pub fn request(&self) -> Value {
        let mut options = json!({});
        if let Some(message) = &self.message {
            options["message"] = json!(message);
        }
        options["unmodified"] = json!(self.unmodified);
        options["unmerged"] = json!(self.unmerged);
        options["build"] = json!(false);
        options
    }

    /// `tagOptions` of `commandTagPrepare`.
    pub fn tag_options(&self) -> Value {
        let release = &self.release;
        let mut options =
            json!({ "patterns": self.selection.patterns, "releaseType": release.level });
        if let Some(level) = &release.auto_tag_release_type {
            options["autoTagReleaseType"] = json!(level);
        }
        options["incrementBy"] = json!(release.increment_by);
        if let Some(version) = &release.exact_version {
            options["exactVersion"] = json!(version);
        }
        if let Some(id) = &release.pre_release_id {
            options["preReleaseId"] = json!(id);
        }
        options["snapped"] = json!(self.snapped);
        options["skipAutoTag"] = json!(self.skip_auto_tag);
        if self.mode == Mode::Soft {
            options["soft"] = json!(true);
        }
        if self.mode == Mode::Persist {
            options["persist"] = json!(true);
        }
        options
    }

    /// Return the first `<pattern>@<version>` suffix that is not a valid semver string.
    pub fn invalid_pattern_version(&self) -> Option<&str> {
        for pattern in &self.selection.patterns {
            if let Some((base, ver)) = pattern.rsplit_once('@')
                && !base.is_empty()
                && !ver.is_empty()
                && node_semver::npm::valid(ver).is_none()
            {
                return Some(ver);
            }
        }
        None
    }
}

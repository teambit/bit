//! Native `bit tag [component-patterns...]`: the engine plans and writes the
//! tags (`workspace_command::resolve`), with the tag options and report.

mod options;

use super::{
    color::Chalk,
    merge::force_local_build,
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
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native tag grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let prepared = plan_tag(&root, args, &options);
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("tag: {error}"))),
    };
    let warn = options.message.is_none() && options.mode != Mode::Persist;
    workspace_command::execute(&root, args, "tag", planned, &report, |output| {
        warnings(output, warn, options.mode == Mode::Soft);
        render_progress(output, progress.as_ref(), &options.mode);
    })
}

fn plan_tag(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<(Planned, Report, Option<Progress>)> {
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Tag,
        options: options.request(),
        selection: resolve::Selection::Tag {
            tag_options: options.tag_options(),
            patterns: &options.patterns,
            exact_version: options.release.exact_version.as_deref(),
        },
    };
    let planned = resolve::plan(root, &request)?;
    let labels = match options.mode {
        Mode::Soft => &versions::SOFT_TAG,
        Mode::Persist => &versions::PERSIST_TAG,
        Mode::Ordinary => &versions::TAG,
    };
    let report = versions::format(&planned.plan["result"], Chalk::detect(args), labels)?;
    let progress = Progress::parse_snap(planned.plan.get("progress"))?;
    Ok((planned, report, progress))
}

fn render_progress(output: &Output, progress: Option<&Progress>, mode: &Mode) {
    if let Some(progress) = progress {
        if *mode == Mode::Soft {
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

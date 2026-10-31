//! Native `bit build [component-pattern]` (`scopes/pipelines/builder/build.cmd.ts`).

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    scope_set::{Failure, selection},
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, iter::Peekable, path::Path};

pub const COMMAND: Command = Command { name: "build", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";
const REWRITE_ERR: &str = "cannot use --rewrite without --reuse-capsules";
const REINSTALL_ERR: &str = "cannot use --reinstall without --reuse-capsules";
const EMPTY_BUILD_HINT: &str = r#"no components found to build. use "--unmodified" flag to build all components or specify the ids to build, otherwise, only new and modified components will be built"#;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct CapsuleFlags {
    pub reuse_capsules: bool,
    pub rewrite: bool,
    pub reinstall: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct PipelineFlags {
    pub tasks: Option<String>,
    pub skip_tasks: Option<String>,
    pub fail_fast: bool,
    pub loose: bool,
    pub reset: bool,
    pub skip_tests: bool,
    pub include_snap: bool,
    pub include_tag: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub unmodified: bool,
    pub dev: bool,
    pub list_tasks: Option<String>,
    pub pipeline: PipelineFlags,
    pub capsules: CapsuleFlags,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("build arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native build grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI build delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(err) = flag_error(&options.capsules) {
        if let Some(root) = workspace::root(&cwd) {
            return workspace_command::execute_without_loader(&root, args, "build", |_| {
                Err(io::Error::other(err))
            });
        }
        return workspace_command::execute_without_loader_scope(&cwd, args, "build", |_| {
            Err(io::Error::other(err))
        });
    }
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_without_loader_scope(&cwd, args, "build", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    run_in_workspace(&cwd, &root, args, &options)
}

fn run_in_workspace(
    cwd: &Path,
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    if let Some(target) = &options.list_tasks {
        return runner::run_list_tasks(root, args, target);
    }
    if is_empty_build_workspace(root, options).unwrap_or(false) {
        let formatter = Formatter::new(Chalk::detect(args));
        return workspace_command::execute_without_loader(root, args, "build", move |_| {
            Ok(Report { data: formatter.hint(EMPTY_BUILD_HINT), code: 0, details: None })
        });
    }
    if let Some(err) = validate_build_pattern(root, options, Chalk::detect(args)) {
        return workspace_command::execute_then(root, args, "build", move |_| {
            Err(io::Error::other(err))
        });
    }
    if let Some(outcome) = runner::try_run(cwd, root, args, options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("build pipeline execution delegated".into()))
}

fn validate_build_pattern(root: &Path, options: &Options, chalk: Chalk) -> Option<String> {
    let pat = options.pattern
        .as_deref()
        .map(str::trim)
        .filter(|pat| !pat.is_empty())?;
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if is_bitmap_auto_sync(&ws_config) {
        return None;
    }
    let default_scope = super::aspect::workspace_default_scope(&ws_config).ok();
    let bitmap = Bitmap::load(root, default_scope.as_deref()).ok()?;
    match selection::resolve_pattern_entries(root, &bitmap, pat, chalk) {
        Err(Failure::User(msg)) => Some(msg),
        _ => None,
    }
}

pub(super) fn flag_error(capsules: &CapsuleFlags) -> Option<&'static str> {
    if capsules.rewrite && !capsules.reuse_capsules {
        Some(REWRITE_ERR)
    } else if capsules.reinstall && !capsules.reuse_capsules {
        Some(REINSTALL_ERR)
    } else {
        None
    }
}

pub(in crate::commands) fn is_bitmap_auto_sync(ws_config: &serde_json::Value) -> bool {
    ws_config
        .as_object()
        .and_then(|obj| {
            obj.get("teambit.workspace/workspace")
                .or_else(|| {
                    obj.iter()
                        .find_map(|(key, val)| {
                            key.starts_with("teambit.workspace/workspace@").then_some(val)
                        })
                })
        })
        .is_some_and(|ws| ws["bitmapAutoSync"] == true)
}

pub(super) fn is_empty_build_workspace(root: &Path, options: &Options) -> io::Result<bool> {
    if options.list_tasks.is_some() || options.pattern.is_some() {
        return Ok(false);
    }
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if is_bitmap_auto_sync(&ws_config) {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied().peekable();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_build_pattern(iter, &mut options.pattern)?;
            break;
        }
        apply_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn consume_trailing_build_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        if pattern.is_some() || val.is_empty() || val.starts_with('-') {
            return None;
        }
        *pattern = Some(val.to_owned());
    }
    Some(())
}

fn apply_token<'a, Iter>(
    arg: &'a str,
    iter: &mut Peekable<Iter>,
    options: &mut Options,
) -> Option<()>
where
    Iter: Iterator<Item = &'a str>,
{
    if apply_switch(arg, options) {
        return Some(());
    }
    match arg {
        "--tasks" => options.pipeline.tasks = Some(take_val(iter.next()?)?),
        "--list-tasks" => {
            let next = iter.next_if(|val| !val.is_empty() && !val.starts_with('-'));
            options.list_tasks = Some(next.unwrap_or_default().to_owned());
        }
        "--skip-tasks" => options.pipeline.skip_tasks = Some(take_val(iter.next()?)?),
        "-i" | "--ignore-issues" => {
            take_val(iter.next()?)?;
        }
        _ => apply_inline_or_positional(arg, options)?,
    }
    Some(())
}

fn apply_switch(arg: &str, options: &mut Options) -> bool {
    match arg {
        "--no-color"
        | "--no-color=true"
        | "--no-color=false"
        | "--install"
        | "--install=true"
        | "--install=false"
        | "--cache-packages-on-capsule-root"
        | "--cache-packages-on-capsule-root=true"
        | "--cache-packages-on-capsule-root=false" => {}
        "--skip-tests" | "--skip-tests=true" => options.pipeline.skip_tests = true,
        "--skip-tests=false" => options.pipeline.skip_tests = false,
        "--loose" | "--loose=true" => options.pipeline.loose = true,
        "--loose=false" => options.pipeline.loose = false,
        "--reset" | "--reset=true" => options.pipeline.reset = true,
        "--reset=false" => options.pipeline.reset = false,
        "--include-snap" | "--include-snap=true" => options.pipeline.include_snap = true,
        "--include-snap=false" => options.pipeline.include_snap = false,
        "--include-tag" | "--include-tag=true" => options.pipeline.include_tag = true,
        "--include-tag=false" => options.pipeline.include_tag = false,
        "-u" | "--unmodified" | "--unmodified=true" => options.unmodified = true,
        "--unmodified=false" => options.unmodified = false,
        "-d" | "--dev" | "--dev=true" => options.dev = true,
        "--dev=false" => options.dev = false,
        "-ud" | "-du" => {
            options.unmodified = true;
            options.dev = true;
        }
        "--reuse-capsules" | "--reuse-capsules=true" => options.capsules.reuse_capsules = true,
        "--reuse-capsules=false" => options.capsules.reuse_capsules = false,
        "--rewrite" | "--rewrite=true" => options.capsules.rewrite = true,
        "--rewrite=false" => options.capsules.rewrite = false,
        "--reinstall" | "--reinstall=true" => options.capsules.reinstall = true,
        "--reinstall=false" => options.capsules.reinstall = false,
        "--fail-fast" | "--fail-fast=true" => options.pipeline.fail_fast = true,
        "--fail-fast=false" => options.pipeline.fail_fast = false,
        _ => return false,
    }
    true
}

fn apply_inline_or_positional(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--tasks=") {
        options.pipeline.tasks = Some(take_val(val)?);
    } else if let Some(val) = arg.strip_prefix("--list-tasks=") {
        options.list_tasks = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--skip-tasks=") {
        options.pipeline.skip_tasks = Some(take_val(val)?);
    } else if let Some(val) = arg
        .strip_prefix("--ignore-issues=")
        .or_else(|| arg.strip_prefix("-i="))
    {
        take_val(val)?;
    } else if !arg.starts_with('-') && !arg.is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

fn take_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

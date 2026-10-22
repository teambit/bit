//! Native `bit build [component-pattern]` (`scopes/pipelines/builder/build.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "build", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";
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
pub(super) struct Options {
    pub pattern: Option<String>,
    pub unmodified: bool,
    pub dev: bool,
    pub tasks: Option<String>,
    pub list_tasks: Option<String>,
    pub skip_tasks: Option<String>,
    pub fail_fast: bool,
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
    if is_empty_build_workspace(&root, &options).unwrap_or(false) {
        let formatter = Formatter::new(Chalk::detect(args));
        return workspace_command::execute_without_loader(&root, args, "build", move |_| {
            Ok(Report { data: formatter.hint(EMPTY_BUILD_HINT), code: 0, details: None })
        });
    }
    Ok(Outcome::Declined("build pipeline execution delegated".into()))
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

pub(super) fn is_empty_build_workspace(root: &Path, options: &Options) -> io::Result<bool> {
    if options.list_tasks.is_some() {
        return Ok(false);
    }
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        apply_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_token<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color"
        | "--install"
        | "--cache-packages-on-capsule-root"
        | "--skip-tests"
        | "--loose"
        | "--include-snap"
        | "--include-tag" => {}
        "-u" | "--unmodified" => options.unmodified = true,
        "-d" | "--dev" => options.dev = true,
        "--reuse-capsules" => options.capsules.reuse_capsules = true,
        "--rewrite" => options.capsules.rewrite = true,
        "--reinstall" => options.capsules.reinstall = true,
        "--fail-fast" => options.fail_fast = true,
        "--tasks" => options.tasks = Some(take_val(iter.next()?)?),
        "--list-tasks" => options.list_tasks = Some(take_val(iter.next()?)?),
        "--skip-tasks" => options.skip_tasks = Some(take_val(iter.next()?)?),
        "-i" | "--ignore-issues" => {
            take_val(iter.next()?)?;
        }
        _ => apply_inline_or_positional(arg, options)?,
    }
    Some(())
}

fn apply_inline_or_positional(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--tasks=") {
        options.tasks = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--list-tasks=") {
        options.list_tasks = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--skip-tasks=") {
        options.skip_tasks = Some((!val.is_empty()).then(|| val.to_owned())?);
    } else if let Some(val) = arg.strip_prefix("--ignore-issues=") {
        (!val.is_empty()).then_some(())?;
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

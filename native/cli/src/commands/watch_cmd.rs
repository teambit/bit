//! Native `bit watch` (`scopes/workspace/watcher/watch.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "watch", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";
const DEPRECATED_IMPORT_WARN: &str =
    r#"the "--import" flag is deprecated and is now the default behavior"#;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub verbose: bool,
    pub skip_pre_compilation: bool,
    pub check_types: Option<String>,
    pub import: bool,
    pub skip_import: bool,
    pub generate_types: bool,
    pub trigger: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("watch arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native watch grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI watch delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(err) = check_types_error(&options) {
        return emit_watch_err(&cwd, args, options.import, err);
    }
    if workspace::root(&cwd).is_none() {
        return emit_watch_err(&cwd, args, options.import, OUTSIDE_WORKSPACE_ERR.to_owned());
    }
    Ok(Outcome::Declined("watch execution delegated".into()))
}

fn emit_watch_err(cwd: &Path, args: &[OsString], import: bool, err: String) -> io::Result<Outcome> {
    if let Some(root) = workspace::root(cwd) {
        return workspace_command::execute_without_loader(&root, args, "watch", move |output| {
            if import {
                output.warning(DEPRECATED_IMPORT_WARN);
            }
            Err(io::Error::other(err))
        });
    }
    workspace_command::execute_without_loader_scope(cwd, args, "watch", move |output| {
        if import {
            output.warning(DEPRECATED_IMPORT_WARN);
        }
        Err(io::Error::other(err))
    })
}

pub(super) fn check_types_error(options: &Options) -> Option<String> {
    let val = options.check_types.as_deref()?;
    if val.is_empty() || val == "file" || val == "project" {
        None
    } else {
        Some(format!(r#"check-types can be either "file" or "project". got "{val}""#))
    }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        apply_token(args, &mut idx, &mut options)?;
        idx += 1;
    }
    Some(options)
}

fn apply_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    match arg {
        "--no-color" => {}
        "-v" | "--verbose" => options.verbose = true,
        "--skip-pre-compilation" => options.skip_pre_compilation = true,
        "-i" | "--import" => options.import = true,
        "--skip-import" => options.skip_import = true,
        "--generate-types" => options.generate_types = true,
        "-t" | "--check-types" => options.check_types = Some(take_optional_check_types(args, idx)),
        "--trigger" => options.trigger = Some(take_required_trigger(args, idx)?),
        _ => apply_inline(arg, options)?,
    }
    Some(())
}

fn take_optional_check_types(args: &[&str], idx: &mut usize) -> String {
    if let Some(&next) = args.get(*idx + 1)
        && !next.starts_with('-')
    {
        *idx += 1;
        next.to_owned()
    } else {
        String::new()
    }
}

fn take_required_trigger(args: &[&str], idx: &mut usize) -> Option<String> {
    let next = *args.get(*idx + 1)?;
    if next.is_empty() || next.starts_with('-') {
        return None;
    }
    *idx += 1;
    Some(next.to_owned())
}

fn apply_inline(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--check-types=") {
        options.check_types = Some(val.to_owned());
    } else {
        let val = arg.strip_prefix("--trigger=")?;
        (!val.is_empty()).then_some(())?;
        options.trigger = Some(val.to_owned());
    }
    Some(())
}

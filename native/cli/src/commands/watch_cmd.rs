//! Native `bit watch` (`scopes/workspace/watcher/watch.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "watch", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";
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
        if args[idx] == "--" {
            return (idx + 1 == args.len()).then_some(options);
        }
        apply_token(args, &mut idx, &mut options)?;
        idx += 1;
    }
    Some(options)
}

fn apply_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    if apply_combined_short(arg, options) {
        return Some(());
    }
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-v" | "--verbose" | "--verbose=true" => options.verbose = true,
        "--verbose=false" => options.verbose = false,
        "-Y" | "--skip-pre-compilation" | "--skip-pre-compilation=true" => {
            options.skip_pre_compilation = true;
        }
        "--skip-pre-compilation=false" => options.skip_pre_compilation = false,
        "-i" | "--import" | "--import=true" => options.import = true,
        "--import=false" => options.import = false,
        "--skip-import" | "--skip-import=true" => options.skip_import = true,
        "--skip-import=false" => options.skip_import = false,
        "--generate-types" | "--generate-types=true" => options.generate_types = true,
        "--generate-types=false" => options.generate_types = false,
        "-t" | "--check-types" => options.check_types = Some(take_optional_check_types(args, idx)),
        "--trigger" => options.trigger = Some(take_required_trigger(args, idx)?),
        _ => apply_inline(arg, options)?,
    }
    Some(())
}

fn apply_combined_short(arg: &str, options: &mut Options) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'v' | b'i' | b'Y'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'v' => options.verbose = true,
            b'i' => options.import = true,
            _ => options.skip_pre_compilation = true,
        }
    }
    true
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
    if let Some(val) = arg
        .strip_prefix("--check-types=")
        .or_else(|| arg.strip_prefix("-t="))
    {
        options.check_types = Some(val.to_owned());
    } else {
        let val = arg.strip_prefix("--trigger=")?;
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.trigger = Some(val.to_owned());
    }
    Some(())
}

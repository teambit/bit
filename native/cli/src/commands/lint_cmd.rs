//! Native `bit lint [component-pattern]` (`scopes/defender/linter/lint.cmd.ts`).

mod runner;
#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "lint", aliases: &[], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub changed: bool,
    pub fix: bool,
    pub fix_type: Option<String>,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("lint arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native lint grammar".into()));
    };
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        return runner::run(&root, args, &options);
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI lint delegated".into()));
    }
    if is_missing_host(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "lint", |_| {
            Err(io::Error::other(HOST_NOT_FOUND_ERR))
        });
    }
    Ok(Outcome::Declined("lint execution delegated".into()))
}

pub(super) fn is_missing_host(cwd: &Path, options: &Options) -> bool {
    options.pattern.is_none()
        && !options.changed
        && workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
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
        "--no-color" => {}
        "-c" | "--changed" => options.changed = true,
        "-f" | "--fix" => options.fix = true,
        "-j" | "--json" => options.json = true,
        "--fix-type" => {
            let val = iter.next()?;
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.fix_type = Some(val.to_owned());
        }
        _ => apply_inline_or_pattern(arg, options)?,
    }
    Some(())
}

fn apply_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--fix-type=") {
        (!val.is_empty()).then_some(())?;
        options.fix_type = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

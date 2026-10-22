//! Native `bit pack <componentId> [scopePath]` (`scopes/pkg/pkg/pack.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "pack", aliases: &[], run };

const SCOPE_NOT_FOUND_ERR: &str = "scope not found";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub comp_id: String,
    pub scope_path: Option<String>,
    pub out_dir: Option<String>,
    pub override_existing: bool,
    pub keep: bool,
    pub prefix: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("pack arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native pack grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI pack delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_missing_scope(&cwd, &options) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "pack", |_| {
            Err(io::Error::other(SCOPE_NOT_FOUND_ERR))
        });
    }
    Ok(Outcome::Declined("pack execution delegated".into()))
}

pub(super) fn is_missing_scope(cwd: &Path, options: &Options) -> bool {
    options.scope_path.is_none()
        && workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut comp_id = None;
    let mut scope_path = None;
    let mut out_dir = None;
    let mut override_existing = false;
    let mut keep = false;
    let mut prefix = false;
    let mut json = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--no-color" => {}
            "-o" | "--override" => override_existing = true,
            "-k" | "--keep" => keep = true,
            "-p" | "--prefix" => prefix = true,
            "-j" | "--json" => json = true,
            "-d" | "--out-dir" => {
                let val = iter.next()?;
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                out_dir = Some(val.to_owned());
            }
            _ => apply_inline_or_positional(arg, &mut comp_id, &mut scope_path, &mut out_dir)?,
        }
    }
    Some(Options { comp_id: comp_id?, scope_path, out_dir, override_existing, keep, prefix, json })
}

fn apply_inline_or_positional(
    arg: &str,
    comp_id: &mut Option<String>,
    scope_path: &mut Option<String>,
    out_dir: &mut Option<String>,
) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--out-dir=") {
        (!val.is_empty()).then_some(())?;
        *out_dir = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() {
        if comp_id.is_none() {
            *comp_id = Some(arg.to_owned());
        } else if scope_path.is_none() {
            *scope_path = Some(arg.to_owned());
        } else {
            return None;
        }
    } else {
        return None;
    }
    Some(())
}

//! Native `bit link [component-names...]` (`scopes/workspace/install/link/link.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "link", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub ids: Vec<String>,
    pub json: bool,
    pub verbose: bool,
    pub rewire: bool,
    pub target: Option<String>,
    pub skip_fetching_objects: bool,
    pub peers: bool,
    pub comp_summary: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("link arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native link grammar".into()));
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI link delegated".into()));
    }
    let cwd = env::current_dir()?;
    if workspace::root(&cwd).is_none() {
        return workspace_command::execute_without_loader_scope(&cwd, args, "link", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    }
    Ok(Outcome::Declined("link execution delegated".into()))
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
        "-j" | "--json" => options.json = true,
        "--verbose" => options.verbose = true,
        "-r" | "--rewire" => options.rewire = true,
        "--skip-fetching-objects" => options.skip_fetching_objects = true,
        "--peers" => options.peers = true,
        "--comp-summary" => options.comp_summary = true,
        "--target" => {
            let val = iter.next()?;
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.target = Some(val.to_owned());
        }
        _ => apply_inline_or_id(arg, options)?,
    }
    Some(())
}

fn apply_inline_or_id(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--target=") {
        (!val.is_empty()).then_some(())?;
        options.target = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() {
        options.ids.push(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

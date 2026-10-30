//! Native `bit link [component-names...]` (`scopes/workspace/install/link/link.cmd.ts`).

mod format;
mod rewire;
mod runner;
mod target;
#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "link", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

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
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native link grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI link delegated".into()));
        }
        return workspace_command::execute_without_loader_scope(&cwd, args, "link", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    if let Some(outcome) = runner::try_run(&root, &cwd, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("link execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            for item in iter {
                (!item.is_empty() && !item.starts_with('-')).then_some(())?;
                options.ids.push(item.to_owned());
            }
            break;
        }
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
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        "-v" | "--verbose" | "--verbose=true" => options.verbose = true,
        "--verbose=false" => options.verbose = false,
        "-r" | "--rewire" | "--rewire=true" => options.rewire = true,
        "--rewire=false" => options.rewire = false,
        "--skip-fetching-objects" | "--skip-fetching-objects=true" => {
            options.skip_fetching_objects = true;
        }
        "--skip-fetching-objects=false" => options.skip_fetching_objects = false,
        "--peers" | "--peers=true" => options.peers = true,
        "--peers=false" => options.peers = false,
        "--comp-summary" | "--comp-summary=true" => options.comp_summary = true,
        "--comp-summary=false" => options.comp_summary = false,
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
    if apply_combined_short(arg, options) {
        return Some(());
    }
    if let Some(val) = arg.strip_prefix("--target=") {
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.target = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() {
        options.ids.push(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

fn apply_combined_short(arg: &str, options: &mut Options) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'j' | b'v' | b'r'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'j' => options.json = true,
            b'v' => options.verbose = true,
            _ => options.rewire = true,
        }
    }
    true
}

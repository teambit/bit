//! Native `bit link [component-names...]` (`scopes/workspace/install/link/link.cmd.ts`).
//!
//! Coordinates [`COMMAND`], [`Options`], [`parse_options`], [`runner`], [`rewire`], [`target`], and [`format`] for workspace and target linking.

mod format;
mod rewire;
mod runner;
mod target;
#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

/// Descriptor for the `bit link` CLI command.
pub const COMMAND: Command = Command { name: "link", aliases: &[], run };

/// Error message emitted when `bit link` is executed outside a Bit workspace.
const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

/// Parsed CLI options for `bit link`.
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

/// Entry point for `bit link` ([`COMMAND`]) that parses [`Options`] via [`parse_options`] and delegates to [`runner::try_run`].
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("link arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native link grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI")
            .is_some_and(|val| {
                let text = val.to_string_lossy();
                let trimmed = text
                    .trim()
                    .trim_matches(['"', '\''])
                    .trim();
                !trimmed.is_empty()
                    && !["0", "false", "no", "off"]
                        .iter()
                        .any(|falsy| trimmed.eq_ignore_ascii_case(falsy))
            })
        {
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

/// Parses CLI arguments after `bit link` into [`Options`] via [`apply_token`], returning `None` for unsupported flags.
#[inline]
pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(raw_arg) = iter.next() {
        let arg = raw_arg.trim();
        if arg == "--" {
            for item in iter {
                let item = item.trim();
                (!item.is_empty() && !item.starts_with('-')).then_some(())?;
                options.ids.push(item.to_owned());
            }
            break;
        }
        apply_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

/// Applies a single `bit link` CLI flag or positional component pattern `arg` onto `options`.
#[inline]
fn apply_token<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" => {}
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
        "--target" if options.target.is_none() => {
            let val = iter.next()?.trim();
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.target = Some(val.to_owned());
        }
        _ => apply_inline_or_id(arg, options)?,
    }
    Some(())
}

#[inline]
fn apply_inline_or_id(arg: &str, options: &mut Options) -> Option<()> {
    if apply_combined_short(arg, options) {
        return Some(());
    }
    if let Some(val) = arg.strip_prefix("--target=") {
        let val = val.trim();
        (options.target.is_none() && !val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.target = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() {
        options.ids.push(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

#[inline]
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

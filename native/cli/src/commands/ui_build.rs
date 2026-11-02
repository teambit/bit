//! Native `bit ui-build [type]` ([`COMMAND`]; `scopes/ui-foundation/ui/ui-build.cmd.tsx`).
//!
//! Validates workspace and [`Options`] preconditions for `bit ui-build` into [`Outcome`].

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

/// Descriptor for the native `bit ui-build` command.
pub const COMMAND: Command = Command { name: "ui-build", aliases: &[], run };

/// Error message emitted when `bit ui-build` is run outside a workspace and scope.
const UNKNOWN_BUILD_ERR: &str = "unknown UI build error";

/// Parsed command-line options for `bit ui-build [ui-root-name]`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub ui_root_name: Option<String>,
}

/// Entry point for `bit ui-build`.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ui-build arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native ui-build grammar".into()));
    }
    if super::scope_rename::ci_active() {
        return Ok(Outcome::Declined("CI ui-build delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_outside_workspace_and_scope(&cwd) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "ui-build", |_| {
            Err(io::Error::other(UNKNOWN_BUILD_ERR))
        });
    }
    Ok(Outcome::Declined("ui-build execution delegated".into()))
}

/// Returns `true` when `cwd` is outside both a Bit workspace and any `.bit` or bare scope directory.
#[must_use]
#[inline]
pub(super) fn is_outside_workspace_and_scope(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| {
                dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
                    || dir.join("scope.json").is_file()
                    || dir.join(".bit/scope.json").is_file()
            })
}

#[must_use]
#[inline]
pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut ui_root_name = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg.trim() {
            "--" => {
                consume_trailing_ui_type(iter, &mut ui_root_name)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            val if !val.starts_with('-') && !val.is_empty() && ui_root_name.is_none() => {
                ui_root_name = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { ui_root_name })
}

#[inline]
fn consume_trailing_ui_type<'a>(
    iter: impl Iterator<Item = &'a str>,
    ui_root_name: &mut Option<String>,
) -> Option<()> {
    for rest in iter {
        let rest = rest.trim();
        if rest.starts_with('-') || rest.is_empty() || ui_root_name.is_some() {
            return None;
        }
        *ui_root_name = Some(rest.to_owned());
    }
    Some(())
}

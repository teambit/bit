//! Native `bit ui-build [type]` (`scopes/ui-foundation/ui/ui-build.cmd.tsx`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "ui-build", aliases: &[], run };

const UNKNOWN_BUILD_ERR: &str = "unknown UI build error";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub ui_root_name: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ui-build arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native ui-build grammar".into()));
    }
    if env::var_os("CI").is_some_and(|val| !val.to_string_lossy().trim().is_empty()) {
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

pub(super) fn is_outside_workspace_and_scope(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit/scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut ui_root_name = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_ui_type(iter, &mut ui_root_name)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            val if !val.starts_with('-') && !val.is_empty() && ui_root_name.is_none() => {
                ui_root_name = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(Options { ui_root_name })
}

fn consume_trailing_ui_type<'a>(
    iter: impl Iterator<Item = &'a str>,
    ui_root_name: &mut Option<String>,
) -> Option<()> {
    for rest in iter {
        if rest.starts_with('-') || rest.is_empty() || ui_root_name.is_some() {
            return None;
        }
        *ui_root_name = Some(rest.to_owned());
    }
    Some(())
}

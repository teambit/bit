//! Native `bit start [component-pattern]` (`scopes/ui-foundation/ui/start.cmd.tsx`, alias `c`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "start", aliases: &["c"], run };

const NO_WORKSPACE_OR_SCOPE_ERR: &str = "bit start can only be run inside a bit workspace or a bit scope - please ensure you are running the command in the correct directory";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub dev: bool,
    pub port: Option<String>,
    pub rebuild: bool,
    pub skip_ui_build: bool,
    pub no_browser: bool,
    pub skip_compilation: bool,
    pub ui_root_name: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("start arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native start grammar".into()));
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI start delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_outside_workspace_and_scope(&cwd) {
        return workspace_command::execute_without_loader_scope(&cwd, args, "start", |_| {
            Err(io::Error::other(NO_WORKSPACE_OR_SCOPE_ERR))
        });
    }
    Ok(Outcome::Declined("start server execution delegated".into()))
}

pub(super) fn is_outside_workspace_and_scope(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit/scope.json").is_file()
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--no-color"
            | "-v"
            | "--verbose"
            | "--show-internal-urls"
            | "--use-root-modules"
            | "--use-source" => {}
            "-d" | "--dev" => options.dev = true,
            "-r" | "--rebuild" => options.rebuild = true,
            "--skip-ui-build" => options.skip_ui_build = true,
            "-n" | "--no-browser" => options.no_browser = true,
            "--skip-compilation" => options.skip_compilation = true,
            "-p" | "--port" => {
                options.port = Some(take_optional_arg(args, &mut idx));
            }
            "-u" | "--ui-root-name" => {
                options.ui_root_name = Some(take_optional_arg(args, &mut idx));
            }
            _ => apply_inline_or_pattern(arg, &mut options)?,
        }
        idx += 1;
    }
    Some(options)
}

fn take_optional_arg(args: &[&str], idx: &mut usize) -> String {
    if let Some(&next) = args.get(*idx + 1)
        && !next.starts_with('-')
    {
        *idx += 1;
        next.to_owned()
    } else {
        String::new()
    }
}

fn apply_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--port=") {
        options.port = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--ui-root-name=") {
        options.ui_root_name = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

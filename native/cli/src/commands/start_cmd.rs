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
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        if args[idx] == "--" {
            consume_trailing_start_pattern(&args[idx + 1..], &mut options.pattern)?;
            break;
        }
        apply_start_token(args, &mut idx, &mut options)?;
        idx += 1;
    }
    Some(options)
}

fn consume_trailing_start_pattern(rest: &[&str], pattern: &mut Option<String>) -> Option<()> {
    for &val in rest {
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

fn apply_start_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    match arg {
        "--no-color"
        | "--no-color=true"
        | "--no-color=false"
        | "-v"
        | "--verbose"
        | "--verbose=true"
        | "--verbose=false"
        | "--show-internal-urls"
        | "--show-internal-urls=true"
        | "--show-internal-urls=false"
        | "--use-root-modules"
        | "--use-root-modules=true"
        | "--use-root-modules=false"
        | "--use-source"
        | "--use-source=true"
        | "--use-source=false" => {}
        "-d" | "--dev" | "--dev=true" => options.dev = true,
        "--dev=false" => options.dev = false,
        "-r" | "--rebuild" | "--rebuild=true" => options.rebuild = true,
        "--rebuild=false" => options.rebuild = false,
        "-s" | "--skip-ui-build" | "--skip-ui-build=true" => options.skip_ui_build = true,
        "--skip-ui-build=false" => options.skip_ui_build = false,
        "-n" | "--no-browser" | "--no-browser=true" => options.no_browser = true,
        "--no-browser=false" => options.no_browser = false,
        "--skip-compilation" | "--skip-compilation=true" => options.skip_compilation = true,
        "--skip-compilation=false" => options.skip_compilation = false,
        "-p" | "--port" => {
            options.port = Some(take_optional_arg(args, idx));
        }
        "-u" | "--ui-root-name" => {
            options.ui_root_name = Some(take_optional_arg(args, idx));
        }
        _ => apply_inline_or_pattern(arg, options)?,
    }
    Some(())
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
    if let Some(val) = arg
        .strip_prefix("--port=")
        .or_else(|| arg.strip_prefix("-p="))
    {
        options.port = Some(val.to_owned());
    } else if let Some(val) = arg
        .strip_prefix("--ui-root-name=")
        .or_else(|| arg.strip_prefix("-u="))
    {
        options.ui_root_name = Some(val.to_owned());
    } else if apply_combined_short(arg, options) {
    } else if !arg.starts_with('-') && !arg.is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}

fn apply_combined_short(arg: &str, options: &mut Options) -> bool {
    let Some(flags) = arg.strip_prefix('-') else {
        return false;
    };
    if flags.len() < 2
        || flags.starts_with('-')
        || !flags
            .chars()
            .all(|ch| matches!(ch, 'd' | 'r' | 's' | 'n' | 'v'))
    {
        return false;
    }
    for ch in flags.chars() {
        match ch {
            'd' => options.dev = true,
            'r' => options.rebuild = true,
            's' => options.skip_ui_build = true,
            'n' => options.no_browser = true,
            _ => {}
        }
    }
    true
}

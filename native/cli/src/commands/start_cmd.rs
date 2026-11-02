//! Native `bit start [component-pattern]` (`scopes/ui-foundation/ui/start.cmd.tsx`, alias `c`).
//!
//! Validates [`Options`] workspace and UI server flags ([`COMMAND`], [`NO_WORKSPACE_OR_SCOPE_ERR`]) before delegating or reporting into [`Outcome`].

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

/// Descriptor for the native `bit start` (`c`) command.
pub const COMMAND: Command = Command { name: "start", aliases: &["c"], run };

/// Error message emitted when `bit start` is run outside a workspace or scope.
const NO_WORKSPACE_OR_SCOPE_ERR: &str = "bit start can only be run inside a bit workspace or a bit scope - please ensure you are running the command in the correct directory";

/// Parsed command-line options for `bit start [component-pattern]`.
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

/// Entry point for `bit start`.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("start arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native start grammar".into()));
    }
    if ci_enabled() {
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

/// Returns `true` when `cwd` is inside neither a Bit workspace nor a local/bare scope.
#[must_use]
#[inline]
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

/// Parses `bit start [component-pattern]` flags and positional pattern into [`Options`].
#[must_use]
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

#[inline]
fn ci_enabled() -> bool {
    env::var_os("CI")
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
}

#[inline]
fn consume_trailing_start_pattern(rest: &[&str], pattern: &mut Option<String>) -> Option<()> {
    for &val in rest {
        let val = val.trim();
        (!val.is_empty()
            && !val.starts_with('-')
            && val.len() <= 4096
            && !val.contains('\0')
            && pattern.replace(val.to_owned()).is_none())
        .then_some(())?;
    }
    Some(())
}

#[inline]
fn is_ignored_start_flag(arg: &str) -> bool {
    matches!(
        arg,
        "--no-color"
            | "--no-color=true"
            | "--no-color=false"
            | "--color"
            | "--color=true"
            | "--color=false"
            | "--color=always"
            | "--color=never"
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
            | "--use-source=false",
    )
}

fn apply_start_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    if is_ignored_start_flag(arg) {
        return Some(());
    }
    match arg {
        "-d" | "--dev" | "--dev=true" => options.dev = true,
        "--dev=false" | "--no-dev" => options.dev = false,
        "-r" | "--rebuild" | "--rebuild=true" => options.rebuild = true,
        "--rebuild=false" | "--no-rebuild" => options.rebuild = false,
        "-s" | "--skip-ui-build" | "--skip-ui-build=true" => options.skip_ui_build = true,
        "--skip-ui-build=false" | "--no-skip-ui-build" => options.skip_ui_build = false,
        "-n" | "--no-browser" | "--no-browser=true" => options.no_browser = true,
        "--no-browser=false" => options.no_browser = false,
        "--skip-compilation" | "--skip-compilation=true" => options.skip_compilation = true,
        "--skip-compilation=false" | "--no-skip-compilation" => options.skip_compilation = false,
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

#[inline]
fn take_optional_arg(args: &[&str], idx: &mut usize) -> String {
    if let Some(&next) = args.get(*idx + 1)
        && !next.trim().starts_with('-')
    {
        *idx += 1;
        next.trim().to_owned()
    } else {
        String::new()
    }
}

fn apply_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    let trimmed = arg.trim();
    if let Some(val) = arg
        .strip_prefix("--port=")
        .or_else(|| arg.strip_prefix("-p="))
    {
        options.port = Some(val.trim().to_owned());
    } else if let Some(val) = arg
        .strip_prefix("--ui-root-name=")
        .or_else(|| arg.strip_prefix("-u="))
    {
        options.ui_root_name = Some(val.trim().to_owned());
    } else if apply_combined_short(arg, options) {
    } else if !trimmed.starts_with('-')
        && !trimmed.is_empty()
        && trimmed.len() <= 4096
        && !trimmed.contains('\0')
        && options.pattern.is_none()
    {
        options.pattern = Some(trimmed.to_owned());
    } else {
        return None;
    }
    Some(())
}

#[inline]
fn apply_combined_short(arg: &str, options: &mut Options) -> bool {
    let Some(flags) = arg.trim().strip_prefix('-') else {
        return false;
    };
    let bytes = flags.as_bytes();
    if bytes.len() < 2
        || bytes[0] == b'-'
        || !bytes
            .iter()
            .all(|byte| matches!(byte, b'd' | b'r' | b's' | b'n' | b'v'))
    {
        return false;
    }
    for &byte in bytes {
        match byte {
            b'd' => options.dev = true,
            b'r' => options.rebuild = true,
            b's' => options.skip_ui_build = true,
            b'n' => options.no_browser = true,
            _ => {}
        }
    }
    true
}

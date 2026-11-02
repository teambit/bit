//! Native `bit format [component-pattern]` (`scopes/defender/formatter/format.cmd.ts`, [`COMMAND`], [`Options`], `--changed`, `--check`, `--json`).

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    lint_cmd::{bare_scope_error, emit_pattern_error, validate_lint_pattern},
    workspace_command,
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

/// Descriptor for the `bit format` CLI command.
pub const COMMAND: Command = Command { name: "format", aliases: &[], run };

/// Error message emitted when `bit format` is invoked outside both a workspace and a bare scope.
const HOST_NOT_FOUND_ERR: &str = "Host was not found";

/// Parsed CLI options for `bit format`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub changed: bool,
    pub check: bool,
    pub json: bool,
}

/// Executes `bit format` in a workspace or reports bare-scope / missing-host errors.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("format arguments are not UTF-8".into()));
    };
    let Some(options) = argv.get(1..).and_then(parse_options) else {
        return Ok(Outcome::Declined("outside native format grammar".into()));
    };
    let ci_active = is_ci_active();
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        if !ci_active
            && let Some(err) =
                validate_lint_pattern(&root, options.pattern.as_deref(), Chalk::detect(args))
        {
            return emit_pattern_error(&root, args, "format", options.json, err);
        }
        return runner::run(&root, args, &options);
    }
    if ci_active {
        return Ok(Outcome::Declined("CI format delegated".into()));
    }
    if is_missing_host(&cwd) {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "format",
            options.json,
            "",
            io::Error::other(HOST_NOT_FOUND_ERR),
        );
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        "format",
        options.json,
        "",
        io::Error::other(bare_scope_error(options.pattern.as_deref(), options.changed)),
    )
}

/// Returns `true` when `cwd` is neither inside a workspace nor inside a bare scope.
#[inline]
pub(super) fn is_missing_host(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
}

/// Parses CLI arguments `args` into [`Options`] when they fit the native `bit format` grammar.
pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_format_pattern(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-c" | "--changed" | "--changed=true" => options.changed = true,
            "--changed=false" => options.changed = false,
            "--check" | "--check=true" => options.check = true,
            "--check=false" => options.check = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            "-cj" | "-jc" => {
                options.changed = true;
                options.json = true;
            }
            val if !val.starts_with('-')
                && !val.trim().is_empty()
                && options.pattern.is_none() =>
            {
                options.pattern = Some(val.trim().to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

#[inline]
fn is_ci_active() -> bool {
    env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && trimmed != "0"
                && !trimmed.eq_ignore_ascii_case("false")
                && !trimmed.eq_ignore_ascii_case("no")
                && !trimmed.eq_ignore_ascii_case("off")
        })
}

#[inline]
fn consume_trailing_format_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        let trimmed = val.trim();
        (!trimmed.is_empty()
            && !trimmed.starts_with('-')
            && pattern.replace(trimmed.to_owned()).is_none())
        .then_some(())?;
    }
    Some(())
}

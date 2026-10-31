//! Native `bit lint [component-pattern]` (`scopes/defender/linter/lint.cmd.ts`).

mod runner;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    remote_action::startup,
    scope_set::{Failure, selection},
    workspace_command,
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "lint", aliases: &[], run };

const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub changed: bool,
    pub fix: bool,
    pub fix_type: Option<String>,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("lint arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native lint grammar".into()));
    };
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) =
                validate_lint_pattern(&root, options.pattern.as_deref(), Chalk::detect(args))
        {
            return emit_pattern_error(&root, args, "lint", options.json, err);
        }
        return runner::run(&root, args, &options);
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI lint delegated".into()));
    }
    if is_missing_host(&cwd) {
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "lint",
            options.json,
            "",
            io::Error::other(HOST_NOT_FOUND_ERR),
        );
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        "lint",
        options.json,
        "",
        io::Error::other(bare_scope_error(options.pattern.as_deref(), options.changed)),
    )
}

pub(super) fn bare_scope_error(pattern: Option<&str>, changed: bool) -> &'static str {
    if pattern.is_some_and(|pat| !pat.is_empty()) {
        "Cannot read properties of undefined (reading 'idsByPattern')"
    } else if changed {
        "Cannot read properties of undefined (reading 'getNewAndModifiedIds')"
    } else {
        "Cannot read properties of undefined (reading 'getMany')"
    }
}

pub(in crate::commands) fn consume_trailing_internalize<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

pub(super) fn read_model_object(
    objects: &bit_install::workspace::ScopeObjects,
    scope: &str,
    name: &str,
) -> Result<serde_json::Value, Failure> {
    use bit_install::workspace::sha1_hex;
    objects
        .read(&sha1_hex(&format!("{scope}/{name}")))
        .and_then(|opt| match opt {
            Some(model) => Ok(Some(model)),
            None => objects.read(&sha1_hex(name)),
        })
        .map_err(|err| Failure::Declined(err.to_string()))?
        .ok_or_else(|| Failure::Declined("missing model object on eject-conf".into()))
}

pub(super) fn emit_pattern_error(
    root: &Path,
    args: &[OsString],
    cmd: &'static str,
    json: bool,
    err: String,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI pattern error stack".into()));
    }
    if json {
        workspace_command::execute_json(root, args, cmd, move |_| Err(io::Error::other(err)))
    } else {
        workspace_command::execute_then(root, args, cmd, move |_| Err(io::Error::other(err)))
    }
}

pub(super) fn validate_lint_pattern(
    root: &Path,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Option<String> {
    let pat = pattern?;
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if !startup::service_supported(root, &ws_config).ok()? {
        return None;
    }
    let default_scope = super::aspect::workspace_default_scope(&ws_config).ok()?;
    let bitmap = Bitmap::load(root, Some(&default_scope)).ok()?;
    match selection::resolve_pattern_entries(root, &bitmap, pat, chalk) {
        Err(Failure::User(msg)) => Some(msg),
        _ => None,
    }
}

pub(super) fn is_missing_host(cwd: &Path) -> bool {
    workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| dir.join("scope.json").is_file() || dir.join(".bit").is_dir())
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_lint_pattern(iter, &mut options.pattern)?;
            break;
        }
        apply_token(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn consume_trailing_lint_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

fn apply_token<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color" => {}
        "-c" | "--changed" | "--changed=true" => options.changed = true,
        "--changed=false" => options.changed = false,
        "-f" | "--fix" | "--fix=true" => options.fix = true,
        "--fix=false" => options.fix = false,
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        "--fix-type" => {
            let val = iter.next()?;
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            options.fix_type = Some(val.to_owned());
        }
        _ => apply_inline_or_pattern(arg, options)?,
    }
    Some(())
}

fn apply_inline_or_pattern(arg: &str, options: &mut Options) -> Option<()> {
    if apply_combined_short(arg, options) {
        return Some(());
    }
    if let Some(val) = arg.strip_prefix("--fix-type=") {
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.fix_type = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.pattern.is_none() {
        options.pattern = Some(arg.to_owned());
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
            .all(|byte| matches!(byte, b'c' | b'f' | b'j'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        match byte {
            b'c' => options.changed = true,
            b'f' => options.fix = true,
            _ => options.json = true,
        }
    }
    true
}

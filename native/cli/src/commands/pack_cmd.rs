//! Native `bit pack <componentId> [scopePath]` (`scopes/pkg/pkg/pack.cmd.tsx`).
//!
//! Validates [`Options`] pack arguments ([`COMMAND`], [`run`], [`is_missing_scope`], [`missing_scope_error`]) and creates component tarballs through [`packer`] into [`Outcome`].

mod packer;
#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

/// Descriptor for the native `bit pack` command.
pub const COMMAND: Command = Command { name: "pack", aliases: &[], run };

/// Error message emitted when the target scope cannot be located.
const SCOPE_NOT_FOUND_ERR: &str = "scope not found";

/// Parsed command-line options for `bit pack`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub comp_id: String,
    pub scope_path: Option<String>,
    pub out_dir: Option<String>,
    pub override_existing: bool,
    pub keep: bool,
    pub prefix: bool,
    pub json: bool,
}

/// Entry point for `bit pack` ([`COMMAND`]) that validates [`is_missing_scope`] and delegates to [`packer::try_pack`].
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("pack arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native pack grammar".into()));
    };
    let ci_enabled = env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("0")
                && !trimmed.eq_ignore_ascii_case("false")
                && !trimmed.eq_ignore_ascii_case("no")
                && !trimmed.eq_ignore_ascii_case("off")
        });
    if ci_enabled {
        return Ok(Outcome::Declined("CI pack delegated".into()));
    }
    let cwd = env::current_dir()?;
    if is_missing_scope(&cwd, &options) {
        return missing_scope_error(&cwd, args, options.json);
    }
    if let Some(outcome) = packer::try_pack(&cwd, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("pack execution delegated".into()))
}

/// Emits the [`SCOPE_NOT_FOUND_ERR`] failure report for `bit pack` into an [`Outcome`] in plain text or `--json` mode.
pub(super) fn missing_scope_error(
    host_dir: &Path,
    args: &[OsString],
    json: bool,
) -> io::Result<Outcome> {
    if json {
        workspace_command::execute_failure_scope(
            host_dir,
            args,
            "pack",
            true,
            "",
            io::Error::other(SCOPE_NOT_FOUND_ERR),
        )
    } else {
        workspace_command::execute_without_loader_scope(host_dir, args, "pack", |_| {
            Err(io::Error::other(SCOPE_NOT_FOUND_ERR))
        })
    }
}

/// Returns `true` when neither `--scope-path`, a workspace root, nor an ancestor scope exists for `cwd`.
#[inline]
pub(super) fn is_missing_scope(cwd: &Path, options: &Options) -> bool {
    options.scope_path.is_none()
        && workspace::root(cwd).is_none()
        && !cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(raw_arg) = iter.next() {
        let arg = raw_arg.trim();
        match arg {
            "--" => {
                consume_trailing_pack_positions(iter, &mut options)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-o" | "--override" | "--override=true" => options.override_existing = true,
            "--override=false" => options.override_existing = false,
            "-k" | "--keep" | "--keep=true" => options.keep = true,
            "--keep=false" => options.keep = false,
            "-p" | "--prefix" | "--prefix=true" => options.prefix = true,
            "--prefix=false" => options.prefix = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            "-d" | "--out-dir" => {
                let val = iter.next()?.trim();
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                options.out_dir = Some(val.to_owned());
            }
            _ => apply_inline_or_positional(arg, &mut options)?,
        }
    }
    (!options.comp_id.is_empty()).then_some(options)
}

fn consume_trailing_pack_positions<'a>(
    iter: impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    for rest in iter {
        let rest = rest.trim();
        if rest.starts_with('-') || rest.is_empty() {
            return None;
        }
        apply_inline_or_positional(rest, options)?;
    }
    Some(())
}

fn apply_inline_or_positional(arg: &str, options: &mut Options) -> Option<()> {
    let arg = arg.trim();
    if let Some(val) = arg
        .strip_prefix("--out-dir=")
        .or_else(|| arg.strip_prefix("-d="))
    {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.out_dir = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() {
        if options.comp_id.is_empty() {
            arg.clone_into(&mut options.comp_id);
        } else if options.scope_path.is_none() {
            options.scope_path = Some(arg.to_owned());
        } else {
            return None;
        }
    } else {
        apply_short_pack_flags(arg, options)?;
    }
    Some(())
}

#[inline]
fn apply_short_pack_flags(arg: &str, options: &mut Options) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'o' => options.override_existing = true,
            'k' => options.keep = true,
            'p' => options.prefix = true,
            'j' => options.json = true,
            _ => return None,
        }
    }
    Some(())
}

#[inline]
pub(super) fn format_pack_report(
    payload: &serde_json::Value,
    chalk: super::color::Chalk,
) -> String {
    let warnings = join_yellow_array(&payload["warnings"], chalk);
    let errors = join_yellow_array(&payload["errors"], chalk);
    let id_str = payload["id"].as_str().map_or("", str::trim);
    let tar_line = payload["metadata"]["tarPath"]
        .as_str()
        .map(str::trim)
        .filter(|tar_path| !tar_path.is_empty())
        .map(|tar_path| chalk.green(&format!("tar path for component {id_str}: {tar_path}")))
        .unwrap_or_default();
    format!("{warnings}\n{errors}\n{tar_line}")
}

#[inline]
fn join_yellow_array(arr_val: &serde_json::Value, chalk: super::color::Chalk) -> String {
    arr_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .map(|msg| chalk.yellow(msg))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

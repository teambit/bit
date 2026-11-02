//! Native `bit update [package-patterns...]` ([`COMMAND`]; `scopes/workspace/install/update.cmd.tsx`, alias `up`).
//!
//! Coordinates [`collect`], [`resolve`], and [`apply`] to update workspace dependency policies into a [`Report`].

mod apply;
mod collect;
mod resolve;
#[cfg(test)]
mod tests;

use super::{
    Command,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

/// Descriptor for the native `bit update` (`up`) command.
pub const COMMAND: Command = Command { name: "update", aliases: &["up"], run };

/// Message printed when no workspace dependencies match the user's filter patterns.
const NO_DEPS_FOUND_MSG: &str = "No dependencies found that match the patterns";
/// Message printed when all matched dependencies already satisfy their latest versions.
const NO_OUTDATED_MSG: &str = "No outdated dependencies found";

/// Parsed command-line options for `bit update [package-patterns...]`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    /// Optional glob patterns filtering which dependencies are updated.
    pub patterns: Vec<String>,
    /// Whether `--yes` (`-y`) was passed to bypass interactive prompts.
    pub yes: bool,
    /// Whether `--patch` was passed to restrict updates to patch versions.
    pub patch: bool,
    /// Whether `--minor` was passed to restrict updates to minor/patch versions.
    pub minor: bool,
    /// Whether `--major` was passed to allow major version jumps.
    pub major: bool,
    /// Whether `--semver` was passed to update within existing semver range constraints.
    pub semver: bool,
}

/// Entry point for `bit update`.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("update arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native update grammar".into()));
    };
    if super::scope_rename::ci_active() {
        return Ok(Outcome::Declined("CI update delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&options);
    };
    if has_no_workspace_dependencies(&root).unwrap_or(false) {
        return workspace_command::execute_then(&root, args, "update", |output| {
            output.failure(NO_DEPS_FOUND_MSG);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    if has_env_jsonc_policy(&root) {
        return Ok(Outcome::Declined("update with env.jsonc delegated".into()));
    }
    let collected = match collect::collect_candidates(&root, &options.patterns) {
        Ok(val) => val,
        Err(reason) => return Ok(Outcome::Declined(format!("update: {reason}"))),
    };
    if collected.candidates.is_empty() {
        return workspace_command::execute_then(&root, args, "update", |output| {
            output.failure(NO_DEPS_FOUND_MSG);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    if !options.yes {
        return Ok(Outcome::Declined("interactive update delegated".into()));
    }
    execute_update(&root, args, &options, &collected)
}

/// Handles `bit update --yes` when invoked outside a workspace by printing [`NO_DEPS_FOUND_MSG`].
fn run_outside_workspace(options: &Options) -> io::Result<Outcome> {
    if !options.yes {
        return Ok(Outcome::Declined("update outside workspace delegated".into()));
    }
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{NO_DEPS_FOUND_MSG}")?;
    stdout.flush()?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// Resolves outdated dependencies from `collected`, applies updates, and runs installation in `root`.
fn execute_update(
    root: &Path,
    args: &[OsString],
    options: &Options,
    collected: &collect::Collected,
) -> io::Result<Outcome> {
    let updates = resolve::resolve_updates(
        root,
        &collected.candidates,
        options,
        collected.save_prefix.as_deref(),
    );
    if updates.is_empty() {
        let semver = options.semver;
        return workspace_command::execute_then(root, args, "update", move |output| {
            output.success(NO_OUTDATED_MSG, None);
            if semver {
                output.console("If you want to find new versions that don't match the current version ranges, retry with the --latest flag");
            }
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    let root_buf = root.to_path_buf();
    workspace_command::execute_then(root, args, "update", move |output| {
        apply::apply_updates(&root_buf, &updates)?;
        output.success("successfully updated dependencies", None);
        Ok(Report { data: String::new(), code: 0, details: None })
    })
}

fn has_env_jsonc_policy(root: &Path) -> bool {
    let Ok(bytes) = fs::read(root.join(".bitmap")) else { return false };
    let Ok(bitmap) = parse_jsonc(&bytes) else { return false };
    let Some(rows) = bitmap.as_object() else { return false };
    rows.iter()
        .any(|(key, row)| {
            !key.starts_with('$')
                && *key != "_bit_lane"
                && *key != "version"
                && row.is_object()
                && row["isAvailableOnCurrentLane"] != false
                && !aspect_entry(&row["config"], "teambit.component/remove")
                    .is_some_and(|(_, cfg)| cfg["removed"] == true)
                && row["rootDir"]
                    .as_str()
                    .map(str::trim)
                    .filter(|dir| !dir.is_empty())
                    .is_some_and(|dir| {
                        root.join(dir)
                            .join("env.jsonc")
                            .is_file()
                    })
        })
}

#[inline]
fn has_aspect_id_prefix(candidate: &str, bare_id: &str) -> bool {
    candidate == bare_id
        || candidate
            .strip_prefix(bare_id)
            .is_some_and(|rest| rest.starts_with('@'))
}

#[must_use]
#[inline]
pub(in crate::commands) fn matches_aspect(entry: &Value, id: &str) -> bool {
    let id = id.trim();
    if let Some(name) =
        [entry["name"].as_str(), entry["legacyId"].as_str(), entry["extensionId"].as_str()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .find(|name| !name.is_empty())
    {
        return has_aspect_id_prefix(name, id);
    }
    let Some((scope, bare_name)) = id.split_once('/') else {
        return false;
    };
    entry["extensionId"]["scope"].as_str().map(str::trim) == Some(scope.trim())
        && entry["extensionId"]["name"]
            .as_str()
            .map(str::trim)
            .is_some_and(|name| has_aspect_id_prefix(name, bare_name.trim()))
}

#[must_use]
#[inline]
pub(in crate::commands) fn bitmap_row_name<'a>(key: &'a str, row: &'a Value) -> &'a str {
    bitmap_row_scope_and_name(key, row).1
}

#[must_use]
#[inline]
pub(in crate::commands) fn bitmap_row_scope_and_name<'a>(
    key: &'a str,
    row: &'a Value,
) -> (&'a str, &'a str) {
    let key = key.trim();
    let key_id = key.rsplit_once('@').map_or(key, |(id, _)| id.trim());
    let key_scope = key_id.split_once('/').map(|(scope, _)| scope.trim());
    let scope = row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
        .or(key_scope)
        .unwrap_or_default();
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or_else(|| {
            if scope.is_empty() {
                key_id
            } else {
                key_id
                    .strip_prefix(scope)
                    .and_then(|rest| rest.strip_prefix('/'))
                    .map_or(key_id, str::trim)
            }
        });
    (scope, name)
}

#[must_use]
#[inline]
pub(in crate::commands) fn bitmap_entry_aspect<'a>(
    entry: &'a bit_install::workspace::BitmapEntry,
    bare_id: &str,
) -> Option<&'a Value> {
    let bare_id = bare_id.trim();
    let map = entry.config.as_ref()?;
    if let Some(val) = map.get(bare_id) {
        return Some(val);
    }
    map.iter()
        .find(|(key, _)| has_aspect_id_prefix(key.trim(), bare_id))
        .map(|(_, val)| val)
}

#[must_use]
#[inline]
pub(in crate::commands) fn aspect_entry<'a>(
    map_val: &'a Value,
    bare_id: &str,
) -> Option<(&'a str, &'a Value)> {
    let bare_id = bare_id.trim();
    let obj = map_val.as_object()?;
    if let Some((key, val)) = obj.get_key_value(bare_id) {
        return Some((key.as_str(), val));
    }
    obj.iter()
        .find(|(key, _)| has_aspect_id_prefix(key.trim(), bare_id))
        .map(|(key, val)| (key.as_str(), val))
}

pub(super) fn has_no_workspace_dependencies(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if super::build_cmd::is_bitmap_auto_sync(&ws_config) {
        return Ok(false);
    }
    if let Some((_, resolver)) = aspect_entry(&ws_config, super::set_peer::DEP_RESOLVER_ID) {
        let policy = &resolver["policy"];
        if non_empty_object(&policy["dependencies"])
            || non_empty_object(&policy["peerDependencies"])
        {
            return Ok(false);
        }
    }
    if aspect_entry(&ws_config, "teambit.workspace/variants")
        .is_some_and(|(_, variants)| non_empty_object(variants))
    {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

#[inline]
fn non_empty_object(val: &Value) -> bool {
    val.as_object()
        .is_some_and(|obj| !obj.is_empty())
}

#[must_use]
#[inline]
pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_patterns(iter, &mut options.patterns)?;
            break;
        }
        apply_update_arg(arg, &mut options)?;
    }
    Some(options)
}

#[inline]
fn apply_update_arg(arg: &str, options: &mut Options) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-y" | "--yes" | "--yes=true" => options.yes = true,
        "--yes=false" => options.yes = false,
        "--patch" | "--patch=true" => options.patch = true,
        "--patch=false" => options.patch = false,
        "--minor" | "--minor=true" => options.minor = true,
        "--minor=false" => options.minor = false,
        "--major" | "--latest" | "--major=true" | "--latest=true" => options.major = true,
        "--major=false" | "--latest=false" => options.major = false,
        "--semver" | "--semver=true" => options.semver = true,
        "--semver=false" => options.semver = false,
        val if !val.starts_with('-') && !val.is_empty() => {
            push_patterns(&mut options.patterns, val)?;
        }
        _ => return None,
    }
    Some(())
}

#[inline]
fn consume_trailing_patterns<'a>(
    iter: impl Iterator<Item = &'a str>,
    patterns: &mut Vec<String>,
) -> Option<()> {
    for rest in iter {
        if rest.starts_with('-') || rest.is_empty() {
            return None;
        }
        push_patterns(patterns, rest)?;
    }
    Some(())
}

#[inline]
fn push_patterns(patterns: &mut Vec<String>, raw: &str) -> Option<()> {
    for part in raw.split(',') {
        let trimmed = part.trim();
        if trimmed.starts_with('-') {
            return None;
        }
        if !trimmed.is_empty() {
            patterns.push(trimmed.to_owned());
        }
    }
    Some(())
}

//! Input validation and user-facing error classification for `bit diff`.

use super::{git, options, selection};
use crate::{
    commands::{color::Chalk, inventory, list::bitmap, status::js::text, workspace_command},
    native::Outcome,
};
use serde_json::Value;
use std::{ffi::OsString, io, path::Path, process::Command};

const OWNED_ERROR_PREFIX: &str = "owned_diff_error:";

/// Execute a command-owned `bit diff` failure with the canonical loader and exit code 1.
pub(super) fn diff_failure(
    root: &Path,
    args: &[OsString],
    options: &options::Options,
    message: &str,
) -> io::Result<Outcome> {
    if options.output.json {
        workspace_command::execute_json(root, args, "diff", |_| Err(io::Error::other(message)))
    } else {
        workspace_command::execute_then(root, args, "diff", |_| Err(io::Error::other(message)))
    }
}

/// Classify a `read` error as a user-facing `bit diff` error when applicable.
pub(super) fn command_error(
    root: &Path,
    options: &options::Options,
    error: &io::Error,
) -> Option<String> {
    let message = error.to_string();
    if let Some(owned) = message.strip_prefix(OWNED_ERROR_PREFIX) {
        return Some(owned.to_owned());
    }
    if message == "the pattern does not select exactly one component" {
        return missing_component_error(root, options);
    }
    if (message.contains("workspaceDiff:") || message.contains("versionDiff:")) && git_missing(root)
    {
        return Some(
            "error: unable to run command because git executable not found. please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'"
                .to_owned(),
        );
    }
    None
}

/// Format `MissingBitMapComponent` when a literal component pattern is absent from `.bitmap`.
fn missing_component_error(root: &Path, options: &options::Options) -> Option<String> {
    let pattern = options.pattern.as_deref()?.trim();
    if pattern.is_empty()
        || selection::stateful(pattern)
        || pattern.contains(['*', ',', '!', '?', '[', ']', '{', '}', '$', ' ', '@'])
    {
        return None;
    }
    let map = bitmap::read(root).ok()?;
    if map.lane.is_some() {
        return None;
    }
    let normalized = inventory::normalize(pattern);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let exists = map.entries
        .iter()
        .any(|entry| {
            let entry_dir = inventory::normalize(&entry.root_dir);
            let entry_dir = entry_dir.strip_prefix("./").unwrap_or(&entry_dir);
            let entry_id = entry.identity.trim();
            entry_dir == directory
                || entry_id == pattern
                || entry_id
                    .split_once('/')
                    .is_some_and(|(_, name)| name == pattern)
        });
    (!exists).then(|| {
        format!(r#"error: component "{pattern}" was not found on your local workspace."#)
    })
}

/// Check whether the configured git executable fails with `NotFound`.
fn git_missing(root: &Path) -> bool {
    let Ok(executable) = git::executable(root) else {
        return false;
    };
    Command::new(executable)
        .arg("--version")
        .output()
        .is_err_and(|error| error.kind() == io::ErrorKind::NotFound)
}

/// Validate `--parent` arity and that requested tags exist on each selected component model.
pub(super) fn validate_requested_versions(
    context: &Value,
    selected: &[Value],
    options: &options::Options,
    has_remote_import: bool,
    chalk: Chalk,
) -> io::Result<()> {
    let from_version = options.versions.from.as_deref();
    let to_version = options.versions.to.as_deref();
    for target in selected {
        let Some(component_model) = model(context, target) else {
            continue;
        };
        if options.versions.parent && to_version.is_some() {
            return Err(io::Error::other(format!(
                "{OWNED_ERROR_PREFIX}--parent flag expects to get only one version",
            )));
        }
        if !has_remote_import {
            let identity = text(target.get("identity"))?;
            validate_target_versions(component_model, identity, from_version, to_version, chalk)?;
        }
    }
    Ok(())
}

/// Ensure requested `from` and `to` versions exist on `component_model`.
fn validate_target_versions(
    component_model: &Value,
    identity: &str,
    from_version: Option<&str>,
    to_version: Option<&str>,
    chalk: Chalk,
) -> io::Result<()> {
    let identity = identity.trim();
    for version in [from_version, to_version].into_iter().flatten() {
        let version = version.trim();
        if !has_model_version(component_model, version) {
            return Err(io::Error::other(format!(
                r#"{OWNED_ERROR_PREFIX}error: version "{}" of component {} was not found."#,
                chalk.bold(version),
                chalk.bold(identity),
            )));
        }
    }
    Ok(())
}

/// Check whether `version` is a 40-char hash or a known tag in `versions` / `orphanedVersions`.
fn has_model_version(component_model: &Value, version: &str) -> bool {
    let version = version.trim();
    let has_head = component_model["head"]
        .as_str()
        .is_some_and(|head| !head.trim().is_empty());
    (version == "latest" && has_head)
        || (version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit()))
        || component_model["versions"].get(version).is_some()
        || component_model["orphanedVersions"].get(version).is_some()
}

/// Look up the scope model for `target` in `context["models"]`.
pub(super) fn model<'c>(context: &'c Value, target: &Value) -> Option<&'c Value> {
    let identity = target.get("identity")?.as_str()?.trim();
    context
        .get("models")?
        .as_array()?
        .iter()
        .find(|entry| model_identity(entry) == identity)
}

/// Format `"<scope>/<name>"` for a model JSON object.
fn model_identity(entry: &Value) -> String {
    let scope = entry
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .unwrap_or("undefined");
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("undefined");
    format!("{scope}/{name}")
}

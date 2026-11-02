//! Decline startup callbacks and lane hydration before issuing any remote action.
//!
//! [`supported`] and [`service_supported`] check `workspace.jsonc` ([`parse_jsonc`]) and [`Installer`] constraints before effects.
use crate::commands::installation::Installer;
use bit_workspace_config::parse_jsonc;
use serde_json::Value;
use std::{fs, io, path::Path};

/// Returns `true` when `workspace` and `scope` have no startup callbacks or lane hydration requiring delegation.
#[inline]
pub(in crate::commands) fn supported(
    workspace: Option<&Path>,
    scope: &Path,
    config: &Value,
    load_workspace: bool,
) -> io::Result<bool> {
    let Some(root) = workspace else { return scope_supported(scope) };
    supported_workspace(root, config, load_workspace, Installer::needs_canonical(root))
}

/// Returns `true` when `root` and `config` require no service-level aspect callbacks or lane hydration.
#[inline]
pub(in crate::commands) fn service_supported(root: &Path, config: &Value) -> io::Result<bool> {
    supported_workspace(root, config, true, Installer::needs_service_callbacks(root))
}

fn supported_workspace(
    root: &Path,
    config: &Value,
    load_workspace: bool,
    callbacks: bool,
) -> io::Result<bool> {
    if callbacks {
        return Ok(false);
    }
    if !load_workspace {
        return Ok(true);
    }
    let workspace = config
        .as_object()
        .and_then(|aspects| {
            aspects
                .iter()
                .find(|(key, _)| {
                    bit_install::config::aspect_id_without_version(key)
                        == "teambit.workspace/workspace"
                })
        })
        .map_or(&Value::Null, |(_, value)| value);
    if workspace["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let default_scope = workspace["defaultScope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty());
    let bitmap = bit_install::workspace::Bitmap::load(root, default_scope)?;
    Ok(bitmap.lane.as_ref().is_none_or(|lane| is_main_lane(&lane.name)))
}

#[inline]
fn is_main_lane(name: &str) -> bool {
    let bare = name
        .trim()
        .split('@')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches('/');
    bare.is_empty() || bare.rsplit('/').next().map(str::trim) == Some("main")
}

fn scope_supported(scope: &Path) -> io::Result<bool> {
    let path = scope.join("scope.jsonc");
    let raw = match fs::read(path) {
        Ok(bytes) if bytes.iter().all(u8::is_ascii_whitespace) => Value::Null,
        Ok(bytes) => parse_jsonc(&bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(error) => return Err(error),
    };
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    if !config_supported(&raw, &core) {
        return Ok(false);
    }
    let global =
        bit_workspace_config::read_global_config(&bit_workspace_config::global_config_dir())?;
    Ok(config_supported(&global, &core))
}

#[inline]
fn config_supported(config: &Value, core: &[String]) -> bool {
    let Some(entries) = config.as_object() else { return config.is_null() };
    entries
        .keys()
        .all(|key| {
            let key = key.trim();
            key != "require"
                && (!key.contains('/')
                    || core
                        .iter()
                        .any(|id| id == bit_install::config::aspect_id_without_version(key)))
        })
}

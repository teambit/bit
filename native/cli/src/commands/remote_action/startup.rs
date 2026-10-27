//! Decline startup callbacks and lane hydration before issuing any remote action.
use crate::commands::installation::Installer;
use bit_workspace_config::parse_jsonc;
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn supported(
    workspace: Option<&Path>,
    scope: &Path,
    config: &Value,
    load_workspace: bool,
) -> io::Result<bool> {
    let Some(root) = workspace else { return scope_supported(scope) };
    if Installer::needs_canonical(root) {
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
    let bitmap = bit_install::workspace::Bitmap::load(root, workspace["defaultScope"].as_str())?;
    Ok(bitmap.lane
        .as_ref()
        .is_none_or(|lane| lane.name == "main"))
}

fn scope_supported(scope: &Path) -> io::Result<bool> {
    let path = scope.join("scope.jsonc");
    let raw = match fs::read(path) {
        Ok(bytes) => parse_jsonc(&bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(error) => return Err(error),
    };
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let global =
        bit_workspace_config::read_global_config(&bit_workspace_config::global_config_dir())?;
    Ok([&raw, &global].into_iter().all(|config| config_supported(config, &core)))
}

fn config_supported(config: &Value, core: &[String]) -> bool {
    let Some(entries) = config.as_object() else { return true };
    entries
        .keys()
        .all(|key| {
            key != "require"
                && (!key.contains('/')
                    || core
                        .iter()
                        .any(|id| id == bit_install::config::aspect_id_without_version(key)))
        })
}

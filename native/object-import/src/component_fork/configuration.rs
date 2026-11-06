//! Target `.bitmap` row ([`insert`]) and aspect configuration assembly for component forks.

use super::{
    Options,
    identity::{Identity, source_id},
    unsupported,
};
use serde_json::{Value, json};
use std::io;

/// Inserts the newly forked [`Identity`] component row and aspect configuration into `bitmap` [`Value`].
#[inline]
pub(super) fn insert(
    bitmap: &mut Value,
    options: &Options,
    source: &Value,
    id: &Identity,
) -> io::Result<()> {
    let config = config(options, source)?;
    let row = json!({"name":id.name,"scope":"","version":"","defaultScope":id.scope,"mainFile":id.main,"rootDir":id.directory,"config":config});
    let rows = bitmap.as_object_mut().ok_or_else(|| unsupported("fork bitmap object"))?;
    let key = crate::component_rename::copy_refactor::target_key(rows, &id.name, &id.target)?;
    rows.insert(key, row);
    Ok(())
}
/// Assemble the `.bitmap` aspect configuration [`Value`] object for a newly forked component from [`Options`].
fn config(options: &Options, source: &Value) -> io::Result<Value> {
    let mut result = json!({});
    if source["skipConfig"] != true {
        copy(&mut result, source)?;
    }
    if !options.no_link {
        result["teambit.component/forking"] = json!({"forkedFrom":forked_from(options, source)?});
    }
    if let Some(overrides) = source.get("config") {
        for (key, value) in
            overrides.as_object().ok_or_else(|| unsupported("fork config override object"))?
        {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                return Err(unsupported("fork config override key"));
            }
            result[trimmed] = value.clone();
        }
    }
    Ok(result)
}
/// Build the `forkedFrom` provenance descriptor (`scope`, `name`, optional `version`) for `source`.
fn forked_from(options: &Options, source: &Value) -> io::Result<Value> {
    let (scope, name) = source_id(options, source)?;
    if let Some(id) = source.get("sourceId").filter(|id| id.is_object()) {
        return Ok(id.clone());
    }
    let mut id = json!({"name":name,"scope":scope});
    if let Some(version) = source_version(source) {
        id["version"] = json!(version);
    }
    Ok(id)
}
/// Extract a concrete semver or snap version from `source` when not `"latest"` or `"head"`.
fn source_version(source: &Value) -> Option<&str> {
    source["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .or_else(|| {
            source["identity"]
                .as_str()
                .and_then(|id| id.rsplit_once('@').map(|(_, version)| version.trim()))
        })
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
}
/// Copy truthy aspect configurations from `source` (`sourceConfigs` or `current.extensions`) into the `output` [`Value`].
fn copy(output: &mut Value, source: &Value) -> io::Result<()> {
    if let Some(configs) = source.get("sourceConfigs") {
        return copy_configs(output, configs);
    }
    let Some(entries) = source["current"]["extensions"].as_array() else { return Ok(()) };
    for entry in entries {
        if !bit_workspace_config::truthy(&entry["config"]) {
            continue;
        }
        let Some(key) = extension_key(entry) else {
            continue;
        };
        insert_config(output, &key, &entry["config"]);
    }
    Ok(())
}
#[inline]
fn non_empty_field<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value[field]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
}
pub(super) fn extension_key(entry: &Value) -> Option<String> {
    if let Some(key) = ["id", "name", "legacyId", "extensionId"]
        .into_iter()
        .find_map(|field| non_empty_field(entry, field))
    {
        return Some(
            key.strip_suffix("@latest")
                .or_else(|| key.strip_suffix("@head"))
                .unwrap_or(key)
                .trim(),
        )
        .filter(|stripped| !stripped.is_empty())
        .map(str::to_owned);
    }
    let ext = &entry["extensionId"];
    let scope = non_empty_field(ext, "scope")?;
    let raw_name = non_empty_field(ext, "name")?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(base, ver)| (base.trim(), Some(ver.trim())));
    if name.is_empty() {
        return None;
    }
    let version = non_empty_field(ext, "version")
        .or(inline_ver)
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"));
    Some(version.map_or_else(
        || format!("{scope}/{name}"),
        |version| format!("{scope}/{name}@{version}"),
    ))
}
fn copy_configs(output: &mut Value, configs: &Value) -> io::Result<()> {
    if let Some(entries) = configs.as_array() {
        for entry in entries {
            let key = entry["id"]
                .as_str()
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .ok_or_else(|| unsupported("fork source config identity"))?;
            insert_config(output, key, &entry["config"]);
        }
        return Ok(());
    }
    for (key, value) in configs.as_object().ok_or_else(|| unsupported("fork source configs"))? {
        insert_config(output, key, value);
    }
    Ok(())
}
fn insert_config(output: &mut Value, key: &str, config: &Value) {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return;
    }
    let bare = match trimmed.rsplit_once('@') {
        Some((prefix, _)) if !prefix.trim().is_empty() => prefix.trim(),
        _ => trimmed,
    };
    if !matches!(bare, "teambit.pkg/pkg" | "teambit.component/renaming")
        && bit_workspace_config::truthy(config)
    {
        output[trimmed] = config.clone();
    }
}

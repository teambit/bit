//! Validated bitmap targets and status-facing bitmap state.

use super::{super::Target, document, invalid};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(in crate::workspace::engine) fn targets(
    root: &Path,
    config: &Value,
) -> io::Result<Vec<Target>> {
    let bitmap = document(&root.join(".bitmap"))?;
    let targets = bitmap_targets(&bitmap, config)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    Ok(targets
        .into_iter()
        .zip(
            entries
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane")),
        )
        .filter(|(_, (_, entry))| entry["isAvailableOnCurrentLane"] != false)
        .map(|(target, _)| target)
        .collect())
}
fn bitmap_targets(bitmap: &Value, config: &Value) -> io::Result<Vec<Target>> {
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    let metadata_rows = 1 + usize::from(entries.contains_key("_bit_lane"));
    if bitmap["$schema-version"] != "17.0.0" || entries.len() > 4096 + metadata_rows {
        return Err(invalid("status bitmap schema or count"));
    }
    let mut roots = HashSet::new();
    let mut ids = HashSet::new();
    let mut targets = Vec::new();
    for (key, value) in entries {
        if key == "$schema-version" || key == "_bit_lane" {
            continue;
        }
        insert_target(key, value, config, &mut roots, &mut ids, &mut targets)?;
    }
    Ok(targets)
}
fn insert_target(
    key: &str,
    value: &Value,
    config: &Value,
    roots: &mut HashSet<String>,
    ids: &mut HashSet<String>,
    targets: &mut Vec<Target>,
) -> io::Result<()> {
    // Object.keys puts integer-like property names first; decline those
    // legacy aliases until the command uses the shared JS property ordering.
    if key.parse::<u32>().is_ok() {
        return Err(invalid("status numeric bitmap alias"));
    }
    let target = target(value, config)?;
    if !roots.insert(target.directory.clone()) || !ids.insert(target.id.clone()) {
        return Err(invalid("status duplicate component"));
    }
    targets.push(target);
    Ok(())
}
fn target(value: &Value, config: &Value) -> io::Result<Target> {
    validate_entry(value)?;
    let name = text(value, "name")?;
    let scope = text(value, "scope")?;
    let version = text(value, "version")?;
    let directory = text(value, "rootDir")?;
    let effective_scope = if scope.is_empty() {
        value
            .get("defaultScope")
            .unwrap_or_else(|| &config["defaultScope"])
            .as_str()
            .ok_or_else(|| invalid("status missing default scope"))?
    } else {
        scope
    };
    identifier(name, true)?;
    identifier(effective_scope, false)?;
    if !version.is_empty() && !version_supported(version) {
        return Err(invalid("status unsupported version syntax"));
    }
    if !scope.is_empty() && version.is_empty() {
        return Err(invalid("status unversioned scoped component"));
    }
    relative(directory, true)?;
    relative(text(value, "mainFile")?, false)?;
    Ok(Target {
        id: format!("{effective_scope}/{name}"),
        directory: directory.into(),
        version: version.into(),
    })
}
fn validate_entry(value: &Value) -> io::Result<()> {
    let entry = value.as_object().ok_or_else(|| invalid("status bitmap entry"))?;
    if entry
        .keys()
        .any(|key| {
            !matches!(
                key.as_str(),
                "name"
                    | "scope"
                    | "version"
                    | "defaultScope"
                    | "mainFile"
                    | "rootDir"
                    | "localOnly"
                    | "nextVersion"
                    | "config"
                    | "onLanesOnly"
                    | "isAvailableOnCurrentLane",
            )
        })
    {
        return Err(invalid("status component requires Harmony"));
    }
    validate_flags(value)?;
    Ok(())
}

fn validate_flags(value: &Value) -> io::Result<()> {
    if value
        .get("localOnly")
        .is_some_and(|flag| !flag.is_boolean())
        || value
            .get("onLanesOnly")
            .is_some_and(|flag| !flag.is_boolean())
        || value
            .get("isAvailableOnCurrentLane")
            .is_some_and(|flag| !flag.is_boolean())
        || value
            .get("nextVersion")
            .is_some_and(|next| !next.is_object())
        || value
            .get("config")
            .is_some_and(|config| !component_config(config))
    {
        return Err(invalid("status bitmap state"));
    }
    Ok(())
}

/// Bitmap rows hidden on the current lane, with their removal state.
pub(in crate::workspace::engine) fn inactive_targets(
    root: &Path,
    config: &Value,
) -> io::Result<Vec<(String, bool)>> {
    let bitmap = document(&root.join(".bitmap"))?;
    let targets = bitmap_targets(&bitmap, config)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    Ok(targets
        .into_iter()
        .zip(
            entries
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane")),
        )
        .filter(|(_, (_, entry))| entry["isAvailableOnCurrentLane"] == false)
        .map(|(target, (_, entry))| {
            (target.id, entry["config"]["teambit.component/remove"]["removed"] == true)
        })
        .collect())
}
fn component_config(config: &Value) -> bool {
    config
        .as_object()
        .is_some_and(|aspects| aspects.iter().all(|(name, value)| aspect_config(name, value)))
}

fn aspect_config(name: &str, value: &Value) -> bool {
    let Some(fields) = value.as_object() else { return value == "-" };
    if let Some(specific) = fields.get("__specific") {
        if !specific.is_boolean() {
            return false;
        }
        let mut configured = fields.clone();
        configured.shift_remove("__specific");
        return aspect_config(name, &Value::Object(configured));
    }
    aspect_fields(name, value, fields)
}

fn aspect_fields(name: &str, value: &Value, fields: &serde_json::Map<String, Value>) -> bool {
    if fields.is_empty() {
        return true;
    }
    match name {
        "teambit.dependencies/dependency-resolver" => true,
        "teambit.component/deprecation" => deprecation_config(fields),
        "teambit.component/remove" => removal_config(value, fields),
        "teambit.envs/envs" => fields.len() == 1 && value["env"].is_string(),
        "teambit.component/dev-files" => fields
            .keys()
            .all(|key| key == "devFilePatterns"),
        "teambit.component/issues" => {
            fields
                .keys()
                .all(|key| key == "ignoreIssues")
                && value["ignoreIssues"]
                    .as_array()
                    .is_some_and(|names| names.iter().all(Value::is_string))
        }
        "teambit.component/internalize" => {
            fields
                .keys()
                .all(|key| key == "internal")
                && value["internal"].is_boolean()
        }
        "teambit.pkg/pkg" => fields
            .keys()
            .all(|key| key == "packageJson"),
        _ => true,
    }
}
fn removal_config(value: &Value, fields: &serde_json::Map<String, Value>) -> bool {
    value["removed"].is_boolean()
        && fields
            .iter()
            .all(|(key, value)| {
                matches!(key.as_str(), "removed" | "removeOnMain") && value.is_boolean()
            })
}
fn deprecation_config(fields: &serde_json::Map<String, Value>) -> bool {
    fields
        .iter()
        .all(|(key, value)| match key.as_str() {
            "deprecate" => value.is_boolean(),
            "range" => value.is_string() || value.is_null(),
            "newId" => replacement_id(value),
            _ => false,
        })
}
fn replacement_id(value: &Value) -> bool {
    if value.is_null() || value == "" {
        return true;
    }
    value
        .as_object()
        .is_some_and(|id| {
            id.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| !name.is_empty())
                && id
                    .iter()
                    .all(|(key, value)| {
                        matches!(key.as_str(), "scope" | "name" | "version") && value.is_string()
                    })
        })
}

pub(super) fn identifier(value: &str, slash: bool) -> io::Result<()> {
    if value.is_empty()
        || value.len() > 1024
        || value
            .split('/')
            .any(|part| {
                part.is_empty()
                    || matches!(part, "." | "..")
                    || !part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || matches!(byte, b'-' | b'_')
                                || (!slash && byte == b'.')
                        })
            })
        || (!slash && !scope_supported(value))
    {
        return Err(invalid("status component identity"));
    }
    Ok(())
}
fn scope_supported(value: &str) -> bool {
    value.len() >= 2
        && !value.contains('/')
        && !value.starts_with('.')
        && !value.ends_with('.')
        && value
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
}
fn version_supported(value: &str) -> bool {
    crate::merge_history::hash(value).is_ok()
        || (value.split('.').count() == 3
            && value
                .split('.')
                .all(|part| {
                    (part == "0" || !part.starts_with('0'))
                        && part.bytes().all(|byte| byte.is_ascii_digit())
                        && part
                            .parse::<u64>()
                            .is_ok_and(|number| number <= 9_007_199_254_740_991)
                }))
}
fn relative(value: &str, root: bool) -> io::Result<()> {
    if root && value == "." {
        return Ok(());
    }
    if value.is_empty()
        || !value.is_ascii()
        || value.len() > 32768
        || value
            .bytes()
            .any(|byte| {
                matches!(byte, 0 | b'\\' | b':' | b'*' | b'?' | b'[' | b']' | b'{' | b'}' | b'!')
            })
        || value
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("status component path"));
    }
    Ok(())
}
fn text<'a>(value: &'a Value, key: &str) -> io::Result<&'a str> {
    value[key].as_str().ok_or_else(|| invalid("status invalid component field"))
}

pub(in crate::workspace::engine) fn context_targets(
    root: &Path,
    config: &Value,
) -> io::Result<Vec<Value>> {
    let bitmap = document(&root.join(".bitmap"))?;
    context_bitmap_targets(&bitmap, config)
}
pub(in crate::workspace::engine) fn context_bitmap_targets(
    bitmap: &Value,
    config: &Value,
) -> io::Result<Vec<Value>> {
    let targets = bitmap_targets(bitmap, config)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    Ok(targets
        .into_iter()
        .zip(
            entries
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane")),
        )
        .map(|(target, (_, entry))| {
            json!({"identity":target.id,"directory":target.directory,
            "version":target.version,"mainFile":entry["mainFile"],
            "scoped":entry["scope"].as_str().is_some_and(|scope| !scope.is_empty()),
            "localOnly":entry["localOnly"] == true,
            "softTagged":entry.get("nextVersion").is_some_and(|value| !value.is_null()),
            "componentConfig":entry.get("config").cloned().unwrap_or(Value::Null),
            "locallyRemoved":entry["config"]["teambit.component/remove"]["removed"] == true})
        })
        .collect())
}

#[cfg(test)]
mod rename_tests;

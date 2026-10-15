//! Validated bitmap targets and status-facing bitmap state.

use super::{super::Target, document, invalid};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(in crate::workspace::engine) fn targets(
    root: &Path,
    config: &Value,
) -> io::Result<Vec<Target>> {
    let bitmap = document(&root.join(".bitmap"))?;
    bitmap_targets(&bitmap, config)
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
                    | "config",
            )
        })
    {
        return Err(invalid("status component requires Harmony"));
    }
    if value
        .get("localOnly")
        .is_some_and(|flag| !flag.is_boolean())
        || value
            .get("nextVersion")
            .is_some_and(|next| !next.is_object())
        || value
            .get("config")
            .is_some_and(|config| !removal_config(config))
    {
        return Err(invalid("status bitmap state"));
    }
    Ok(())
}
fn removal_config(config: &Value) -> bool {
    let Some(aspects) = config.as_object() else { return false };
    if aspects.is_empty() {
        return true;
    }
    aspects.len() == 1
        && aspects["teambit.component/remove"]
            .as_object()
            .is_some_and(|removal| removal.len() == 1 && removal["removed"].is_boolean())
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
            "locallyRemoved":entry["config"]["teambit.component/remove"]["removed"] == true})
        })
        .collect())
}

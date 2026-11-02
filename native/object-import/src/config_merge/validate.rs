//! Input schema validation ([`fields`], [`semver`]) for component, workspace-update, and workspace-merge config requests.

use super::{array, invalid, text};
use serde_json::Value;
use std::io;

/// Validates that `input` is a JSON object containing only keys listed in `fields`.
#[inline]
pub(super) fn fields(input: &Value, fields: &[&str]) -> io::Result<()> {
    let object = input.as_object().ok_or_else(|| invalid("config request object"))?;
    if object
        .keys()
        .any(|key| !fields.contains(&key.as_str()))
    {
        return Err(invalid("unknown config fields"));
    }
    Ok(())
}
/// Validates a map of `SemVer` range descriptor objects (at most `4096` entries).
#[inline]
pub(super) fn semver(input: &Value) -> io::Result<()> {
    let entries = input
        .as_object()
        .filter(|entries| entries.len() <= 4096)
        .ok_or_else(|| invalid("semver map"))?;
    for entry in entries.values() {
        semver_entry(entry)?;
    }
    Ok(())
}
/// Validates a single `SemVer` range descriptor entry (`version`, `range`, `minimum`, `minimumText`).
fn semver_entry(input: &Value) -> io::Result<()> {
    fields(input, &["version", "range", "minimum", "minimumText"])?;
    if input
        .get("minimumText")
        .is_some_and(|value| !value.is_null())
    {
        text(input, "minimumText")?;
    }
    for field in ["version", "minimum"] {
        if let Some(version) = input
            .get(field)
            .filter(|value| !value.is_null())
        {
            semver_version(version)?;
        }
    }
    if let Some(sets) = input
        .get("range")
        .filter(|value| !value.is_null())
    {
        let sets = sets
            .as_array()
            .filter(|sets| sets.len() <= 4096)
            .ok_or_else(|| invalid("semver sets"))?;
        for set in sets {
            let comparators = set
                .as_array()
                .filter(|set| set.len() <= 4096)
                .ok_or_else(|| invalid("semver comparators"))?;
            for comparator in comparators {
                semver_comparator(comparator)?;
            }
        }
    }
    Ok(())
}
/// Validates a single `SemVer` comparator object (`operator` and optional `version`).
fn semver_comparator(input: &Value) -> io::Result<()> {
    fields(input, &["operator", "version"])?;
    let operator = text(input, "operator")?.trim();
    if !matches!(operator, "" | "=" | ">" | ">=" | "<" | "<=") {
        return Err(invalid("semver operator"));
    }
    if let Some(version) = input
        .get("version")
        .filter(|value| !value.is_null())
    {
        semver_version(version)?;
    } else if !operator.is_empty() {
        return Err(invalid("semver any operator"));
    }
    Ok(())
}
/// Validates a `SemVer` version [`Value`] (`major`, `minor`, `patch`, and `prerelease` identifiers).
fn semver_version(input: &Value) -> io::Result<()> {
    fields(input, &["major", "minor", "patch", "prerelease"])?;
    for field in ["major", "minor", "patch"] {
        if input[field]
            .as_u64()
            .is_none_or(|value| value > 9_007_199_254_740_991)
        {
            return Err(invalid("semver numeric component"));
        }
    }
    for identifier in array(input, "prerelease")? {
        if !identifier.is_u64()
            && !identifier
                .as_str()
                .is_some_and(|text| {
                    !text.is_empty()
                        && text.len() <= 4096
                        && text
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                })
        {
            return Err(invalid("semver prerelease"));
        }
    }
    Ok(())
}

#[inline]
pub(super) fn component(input: &Value) -> io::Result<()> {
    for side in ["current", "base", "other"] {
        for entry in array(input, side)? {
            extension(entry)?;
        }
    }
    Ok(())
}
fn extension(entry: &Value) -> io::Result<()> {
    if !entry.is_object()
        || (!entry["config"].is_object() && entry["config"].as_str().map(str::trim) != Some("-"))
        || !entry["data"].is_object()
    {
        return Err(invalid("extension metadata"));
    }
    if text(entry, "stringId")?.trim().is_empty()
        || text(entry, "idWithoutVersion")?.trim().is_empty()
    {
        return Err(invalid("extension metadata"));
    }
    text(entry, "configJson")?;
    text(entry, "configPretty")?;
    undefined_keys(entry)?;
    dependency_data(&entry["data"])?;
    if !entry["config"]["policy"].is_null() {
        policy(&entry["config"]["policy"])?;
    }
    Ok(())
}

fn dependency_data(input: &Value) -> io::Result<()> {
    for field in ["dependencies", "policy"] {
        let Some(entries) = input[field].as_array() else {
            if !input[field].is_null() {
                return Err(invalid("dependency data"));
            }
            continue;
        };
        if entries.len() > 4096
            || entries
                .iter()
                .any(|entry| !entry.is_object())
        {
            return Err(invalid("dependency data budget"));
        }
    }
    Ok(())
}
fn policy(input: &Value) -> io::Result<()> {
    if !input.is_object() {
        return Err(invalid("config policy object"));
    }
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        if let Some(entries) = input[field].as_array() {
            if entries.len() > 4096
                || entries
                    .iter()
                    .any(|entry| !entry.is_object())
            {
                return Err(invalid("policy entries"));
            }
        } else if !input[field].is_null() && !input[field].is_object() {
            return Err(invalid("policy lifecycle"));
        }
    }
    Ok(())
}

fn undefined_keys(entry: &Value) -> io::Result<()> {
    let Some(keys) = entry.get("dataUndefinedKeys") else {
        return Ok(());
    };
    let keys = keys
        .as_array()
        .filter(|keys| keys.len() <= 4096)
        .ok_or_else(|| invalid("undefined data keys"))?;
    let data = &entry["data"];
    let mut seen = std::collections::HashSet::with_capacity(keys.len());
    for key in keys {
        let key = key
            .as_str()
            .map(str::trim)
            .filter(|key| !key.is_empty() && key.len() <= 4096)
            .ok_or_else(|| invalid("undefined data key"))?;
        if data.get(key).is_some() || !seen.insert(key) {
            return Err(invalid("overlapping undefined data key"));
        }
    }
    Ok(())
}

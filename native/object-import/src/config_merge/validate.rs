use super::{array, invalid, text};
use serde_json::Value;
use std::io;

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
fn semver_entry(input: &Value) -> io::Result<()> {
    fields(input, &["version", "range", "minimum", "minimumText"])?;
    for field in ["version", "minimum"] {
        if let Some(version) = input.get(field) {
            semver_version(version)?;
        }
    }
    if let Some(sets) = input.get("range") {
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
fn semver_comparator(input: &Value) -> io::Result<()> {
    fields(input, &["operator", "version"])?;
    let operator = text(input, "operator")?;
    if !["", "=", ">", ">=", "<", "<="].contains(&operator) {
        return Err(invalid("semver operator"));
    }
    if let Some(version) = input.get("version") {
        semver_version(version)?;
    } else if !operator.is_empty() {
        return Err(invalid("semver any operator"));
    }
    Ok(())
}
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
        || (!entry["config"].is_object() && entry["config"] != "-")
        || !entry["data"].is_object()
    {
        return Err(invalid("extension metadata"));
    }
    text(entry, "stringId")?;
    text(entry, "idWithoutVersion")?;
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
    let mut seen = std::collections::BTreeSet::new();
    for key in keys
        .as_array()
        .filter(|keys| keys.len() <= 4096)
        .ok_or_else(|| invalid("undefined data keys"))?
    {
        let key = key
            .as_str()
            .filter(|key| key.len() <= 4096)
            .ok_or_else(|| invalid("undefined data key"))?;
        if entry["data"].get(key).is_some() || !seen.insert(key) {
            return Err(invalid("overlapping undefined data key"));
        }
    }
    Ok(())
}

//! `VersionFileParser` applies explicit lines before DEFAULT to the complete tag batch.

use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(super) fn tag_data(file: Option<&Value>, identity: &str) -> io::Result<Value> {
    let Some(file) = file.filter(|file| !file.is_null()) else { return Ok(Value::Null) };
    let entries = file["entries"].as_array().ok_or_else(|| invalid("tag versions file entries"))?;
    let version = entries
        .iter()
        .find(|entry| entry["identity"] == identity)
        .map_or(&file["default"], |entry| &entry["version"]);
    let Some(version) = version.as_str() else { return Ok(Value::Null) };
    let prerelease = version
        .split_once('-')
        .and_then(|(_, suffix)| suffix.split('.').next());
    Ok(json!({"versionToTag":version,"prereleaseId":prerelease}))
}

pub(super) fn semver(file: Option<&Value>, base: &Value) -> io::Result<Value> {
    let mut output = base
        .as_object()
        .ok_or_else(|| invalid("tag semantic grammar"))?
        .clone();
    if let Some(values) = file.and_then(|file| file["semver"].as_object()) {
        output.extend(values.clone());
    }
    Ok(Value::Object(output))
}

#[cfg(test)]
mod tests;

pub(super) fn for_component(
    file: Option<&Value>,
    identity: &str,
    automatic_root: bool,
) -> io::Result<Value> {
    if automatic_root
        && !file
            .and_then(|file| file["entries"].as_array())
            .is_some_and(|entries| {
                entries
                    .iter()
                    .any(|entry| entry["identity"] == identity)
            })
    {
        return Ok(Value::Null);
    }
    tag_data(file, identity)
}

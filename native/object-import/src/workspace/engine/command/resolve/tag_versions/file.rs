//! `VersionFileParser` [`tag_data`], [`semver`], and [`for_component`] apply explicit lines before `DEFAULT` to the tag batch.

#[cfg(test)]
mod tests;

use super::invalid;
use serde_json::{Value, json};
use std::io;

/// Resolves the `versionToTag` and `prereleaseId` override for `identity` from a parsed versions `file` for [`for_component`].
pub(super) fn tag_data(file: Option<&Value>, identity: &str) -> io::Result<Value> {
    let Some(file) = file.filter(|file| !file.is_null()) else { return Ok(Value::Null) };
    let identity = identity.trim();
    let entries = file["entries"].as_array().ok_or_else(|| invalid("tag versions file entries"))?;
    if entries.len() > 4096 {
        return Err(invalid("tag versions file entry limit"));
    }
    let version = entries
        .iter()
        .find(|entry| entry["identity"].as_str().map(str::trim) == Some(identity))
        .map_or(&file["default"], |entry| &entry["version"]);
    let Some(version) = version
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
    else {
        return Ok(Value::Null);
    };
    let prerelease = version
        .split_once('-')
        .and_then(|(_, suffix)| suffix.split('.').next())
        .map(str::trim)
        .filter(|pre| !pre.is_empty());
    Ok(json!({"versionToTag":version,"prereleaseId":prerelease}))
}

/// Merges `file["semver"]` entries into the `base` semantic version grammar map via [`invalid`] within the 4,096-entry limit.
#[inline]
pub(super) fn semver(file: Option<&Value>, base: &Value) -> io::Result<Value> {
    let base = base.as_object().ok_or_else(|| invalid("tag semantic grammar"))?;
    let values = file.and_then(|file| file["semver"].as_object());
    if values.is_some_and(|values| values.len() > 4096) {
        return Err(invalid("tag versions file semver limit"));
    }
    let mut output = base.clone();
    if let Some(values) = values {
        output.extend(
            values
                .iter()
                .map(|(key, val)| (key.clone(), val.clone())),
        );
    }
    Ok(Value::Object(output))
}

/// Resolves versions-file [`tag_data`] for `identity`, ignoring `DEFAULT` when `automatic_root` is `true`.
#[inline]
pub(super) fn for_component(
    file: Option<&Value>,
    identity: &str,
    automatic_root: bool,
) -> io::Result<Value> {
    let identity = identity.trim();
    if automatic_root
        && !file
            .and_then(|file| file["entries"].as_array())
            .is_some_and(|entries| {
                entries
                    .iter()
                    .any(|entry| entry["identity"].as_str().map(str::trim) == Some(identity))
            })
    {
        return Ok(Value::Null);
    }
    tag_data(file, identity)
}

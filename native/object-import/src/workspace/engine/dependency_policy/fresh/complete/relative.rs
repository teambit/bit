//! Relative and untracked dependency issue payload [`validate`] checks.

use super::invalid;
use serde_json::Value;
use std::io;

/// Validates serialized relative ([`authored`]) or untracked ([`untracked`]) dependency issue `data` for `kind`.
pub(super) fn validate(kind: &str, data: &str) -> io::Result<()> {
    let fields: serde_json::Map<String, Value> =
        serde_json::from_str(data).map_err(io::Error::other)?;
    if fields.len() > 4096
        || fields
            .keys()
            .any(|key| key.trim().is_empty())
    {
        return Err(invalid("relative issue field budget"));
    }
    for value in fields.values() {
        if kind == "UntrackedDependencies" {
            untracked(value)?;
        } else {
            authored(value)?;
        }
    }
    Ok(())
}

/// Validates an `UntrackedDependencies` issue entry `value`.
#[inline]
fn untracked(value: &Value) -> io::Result<()> {
    if !value["nested"].is_boolean() {
        return Err(invalid("untracked issue nested flag"));
    }
    let files =
        value["untrackedFiles"].as_array().ok_or_else(|| invalid("untracked issue files"))?;
    if files.len() > 4096
        || files
            .iter()
            .any(|file| !non_empty_str(&file["relativePath"]) || !file["existing"].is_boolean())
    {
        return Err(invalid("untracked issue file record"));
    }
    Ok(())
}

/// Validates a `RelativeComponentsAuthored` issue entry `value`.
#[inline]
fn authored(value: &Value) -> io::Result<()> {
    let records = value.as_array().ok_or_else(|| invalid("relative authored issue records"))?;
    if records.len() > 4096 {
        return Err(invalid("relative authored issue budget"));
    }
    for record in records {
        let component_id = &record["componentId"];
        let valid_id = non_empty_str(component_id)
            || non_empty_str(&component_id.get("_legacy").unwrap_or(component_id)["name"]);
        let relative_path = &record["relativePath"];
        if !non_empty_str(&record["importSource"])
            || !valid_id
            || !non_empty_str(&relative_path["sourceRelativePath"])
            || !non_empty_str(&relative_path["destinationRelativePath"])
        {
            return Err(invalid("relative authored issue record"));
        }
    }
    Ok(())
}

/// Returns `true` when `value` is a JSON string whose trimmed contents are non-empty.
#[inline]
fn non_empty_str(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|text| !text.trim().is_empty())
}

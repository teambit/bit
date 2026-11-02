//! Fully formatted issue objects supplied by installed Harmony callbacks.
//!
//! [`merge`] and [`validate_callback_object`] deduplicate and append aspect callback issue [`Value`] records against [`HashSet`] ignore filters.

#[cfg(test)]
mod tests;

use super::{decline, text};
use serde_json::Value;
use std::{collections::HashSet, io};

/// Merges Harmony callback issue objects from `raw` into `issues` ([`Value`]), skipping types listed in `ignored` ([`HashSet`]).
pub(super) fn merge(
    issues: &mut Vec<Value>,
    raw: &Value,
    ignored: &HashSet<&str>,
) -> io::Result<()> {
    let Some(raw) = raw
        .as_array()
        .filter(|arr| !arr.is_empty())
    else {
        return Ok(());
    };
    let mut insertion = raw
        .iter()
        .filter_map(|row| {
            row.get("type")
                .and_then(Value::as_str)
                .map(str::trim)
        })
        .filter(|kind| {
            issues
                .iter()
                .any(|issue| issue["type"].as_str().map(str::trim) == Some(*kind))
        })
        .count();
    for object in raw
        .iter()
        .filter_map(|row| row.get("callbackObject"))
    {
        let kind = validate_callback_object(object)?;
        if ignored.contains(kind) {
            continue;
        }
        if let Some(known) = issues
            .iter_mut()
            .find(|issue| issue["type"].as_str().map(str::trim) == Some(kind))
        {
            *known = object.clone();
        } else {
            issues.insert(insertion, object.clone());
            insertion += 1;
        }
    }
    Ok(())
}

/// Validates that `object` is a well-formed Harmony callback issue [`Value`] and returns its trimmed `type` string.
#[inline]
fn validate_callback_object(object: &Value) -> io::Result<&str> {
    if !object.is_object() {
        return Err(decline("Harmony callback issue object"));
    }
    let kind = text(object.get("type"))?.trim();
    if kind.is_empty() {
        return Err(decline("Harmony callback issue type"));
    }
    let valid_data = object
        .get("dataAsString")
        .and_then(Value::as_str)
        .is_some_and(|data| !data.contains('\u{1b}'));
    if !valid_data {
        return Err(decline("Harmony callback issue object"));
    }
    Ok(kind)
}

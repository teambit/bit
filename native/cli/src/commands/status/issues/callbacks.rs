//! Fully formatted issue objects supplied by installed Harmony callbacks.

#[cfg(test)]
mod tests;

use super::{decline, text};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn merge(
    issues: &mut Vec<Value>,
    raw: &Value,
    ignored: &HashSet<&str>,
) -> io::Result<()> {
    let Some(raw) = raw.as_array() else { return Ok(()) };
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
        let kind = text(object.get("type"))?.trim();
        if ignored.contains(kind) {
            continue;
        }
        if !object.is_object() || !object.get("dataAsString").is_some_and(Value::is_string) {
            return Err(decline("Harmony callback issue object"));
        }
        if let Some(known) = issues
            .iter_mut()
            .find(|issue| issue["type"] == kind)
        {
            *known = object.clone();
        } else {
            issues.insert(insertion, object.clone());
            insertion += 1;
        }
    }
    Ok(())
}

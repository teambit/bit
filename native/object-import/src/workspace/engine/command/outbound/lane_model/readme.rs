//! [`validate`] the canonical lane readme snap precondition.

use super::invalid;
use serde_json::Value;
use std::io;

/// Verifies that a non-null `readmeComponent` on `lane` has a matching snapped entry in `components`.
#[inline]
pub(super) fn validate(lane: &Value, name: &str) -> io::Result<()> {
    let Some(readme) = lane
        .get("readmeComponent")
        .filter(|value| !value.is_null())
    else {
        return Ok(());
    };
    let readme_id = id_pair(readme);
    let readme_head = entry_head(readme);
    let present = readme_head.is_some()
        && lane["components"]
            .as_array()
            .is_some_and(|components| {
                components
                    .iter()
                    .any(|component| {
                        entry_head(component) == readme_head
                            && (!readme["id"].is_null() && component["id"] == readme["id"]
                                || readme_id.is_some() && id_pair(component) == readme_id)
                    })
            });
    if present {
        return Ok(());
    }
    Err(invalid(&format!("outbound lane {name} unsnapped readme requires canonical stack")))
}

/// Extracts the trimmed non-empty `head` or `version` string from a lane component `entry`.
#[inline]
fn entry_head(entry: &Value) -> Option<&str> {
    entry["head"]
        .as_str()
        .or_else(|| entry["version"].as_str())
        .map(str::trim)
        .filter(|head| !head.is_empty())
}

#[inline]
fn id_pair(entry: &Value) -> Option<(&str, &str)> {
    let value = entry
        .get("id")
        .filter(|id| !id.is_null())
        .unwrap_or(entry);
    let (scope, name) = if let Some(raw) = value.as_str().map(str::trim) {
        raw.rsplit_once('@')
            .map_or(raw, |(base, _)| base.trim())
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))?
    } else {
        (value["scope"].as_str()?.trim(), value["name"].as_str()?.trim())
    };
    (!scope.is_empty() && !name.is_empty()).then_some((scope, name))
}

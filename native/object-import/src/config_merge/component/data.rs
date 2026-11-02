//! Three-way aspect data merge ([`merge`]) and conflict detection on [`Engine`] for non-dependency-resolver aspects.

#[cfg(test)]
#[path = "data_tests.rs"]
mod tests;

use super::{
    super::{array, invalid},
    Engine,
};
use serde_json::json;
use std::io;

/// Merges three-way aspect `data` entries on `engine` and records any aspect data conflicts.
pub(super) fn merge(engine: &mut Engine<'_>) -> io::Result<()> {
    if engine.input["shouldMergeAspectsData"] != true {
        return Ok(());
    }
    for (index, current) in array(engine.input, "current")?.iter().enumerate() {
        let id = non_empty_str(&current["stringId"], "data id")?;
        let bare = id
            .rsplit_once('@')
            .map_or(id, |(prefix, _)| prefix)
            .trim();
        if matches!(bare, "teambit.dependencies/dependency-resolver" | "teambit.pipelines/builder")
        {
            continue;
        }
        let query = non_empty_str(&current["idWithoutVersion"], "data query")?;
        let base = engine.find("base", query)?;
        let other = engine.find("other", query)?;
        let reason = reason(engine, index, base, other)?;
        if let Some(reason) = reason {
            engine.conflicts.push(json!({"id":id,"reason":reason}));
        }
    }
    for other in array(engine.input, "other")? {
        let id = non_empty_str(&other["stringId"], "data id")?;
        let query = non_empty_str(&other["idWithoutVersion"], "data query")?;
        if engine.find("current", query)?.is_none() {
            engine.conflicts.push(json!({"id":id,"reason":"missing in current"}));
        }
    }
    Ok(())
}
/// Extract a trimmed non-empty string slice from `value`, or return an `invalid(message)` error.
#[inline]
fn non_empty_str<'a>(value: &'a serde_json::Value, message: &str) -> io::Result<&'a str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid(message))
}
/// Return `entry["componentId"]["version"]` when non-empty, or `"undefined"` otherwise.
#[inline]
fn entry_version(entry: Option<&serde_json::Value>) -> &str {
    entry
        .and_then(|entry| entry["componentId"]["version"].as_str())
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .unwrap_or("undefined")
}
/// Determine the conflict reason (if any) for aspect data at `current[index]` on [`Engine`], recording data assignments when clean.
fn reason(
    engine: &mut Engine<'_>,
    index: usize,
    base: Option<usize>,
    other: Option<usize>,
) -> io::Result<Option<String>> {
    let current = &engine.input["current"][index];
    let Some(other_index) = other else {
        return Ok(Some("missing in other".into()));
    };
    let other = &engine.input["other"][other_index];
    let base = base.map(|index| &engine.input["base"][index]);
    let other_ver = entry_version(Some(other));
    if entry_version(Some(current)) != other_ver {
        let base_ver = entry_version(base);
        if base_ver == other_ver {
            return Ok(None);
        }
        return Ok(Some(format!("version changed. base: {base_ver}, other: {other_ver}")));
    }
    if equal(current, other) {
        return Ok(None);
    }
    let Some(base) = base else {
        return Ok(Some("no base-version. conflicted in data".into()));
    };
    if equal(base, other) {
        return Ok(None);
    }
    if equal(base, current) {
        engine.assignments.push(json!({"current":index,"other":other_index}));
        return Ok(None);
    }
    Ok(Some("conflicted in data since base-version".into()))
}

/// Return `true` when `left` and `right` have equal `data` and `dataUndefinedKeys`.
#[inline]
fn equal(left: &serde_json::Value, right: &serde_json::Value) -> bool {
    left["data"] == right["data"]
        && (left["dataUndefinedKeys"] == right["dataUndefinedKeys"]
            || undefined_keys(left) == undefined_keys(right))
}

#[inline]
fn undefined_keys(entry: &serde_json::Value) -> std::collections::BTreeSet<&str> {
    entry["dataUndefinedKeys"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .collect()
}

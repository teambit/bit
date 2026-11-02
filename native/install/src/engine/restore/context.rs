//! Preserve only the resolution settings shared by the dependency graphs contributing packages.
//!
//! Reconciles `pnpmfileChecksum`, `settings`, and `overrides` ([`KEYS`]) across existing and restored lockfiles.
#[cfg(test)]
mod oracle;
#[cfg(test)]
mod tests;

use serde_json::{Map, Value, json};

/// Lockfile resolution context keys (`pnpmfileChecksum`, `settings`, `overrides`) compared across graphs.
const KEYS: [&str; 3] = ["pnpmfileChecksum", "settings", "overrides"];

/// Extract normalized lockfile resolution context fields (`pnpmfileChecksum`, `settings`, `overrides`) from `serialized`.
#[inline]
pub(super) fn graph(serialized: &Value) -> Map<String, Value> {
    let mut context = Map::new();
    for (source, target) in [
        ("pnpmfileChecksum", "pnpmfileChecksum"),
        ("lockfileSettings", "settings"),
        ("overrides", "overrides"),
    ] {
        match serialized.get(source) {
            None | Some(Value::Null) => {}
            Some(Value::String(text)) => {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    context.insert(target.to_owned(), Value::String(trimmed.to_owned()));
                }
            }
            Some(value) => {
                context.insert(target.to_owned(), value.clone());
            }
        }
    }
    if context.get("pnpmfileChecksum").and_then(Value::as_str) == Some("bit-1")
        && !context.contains_key("overrides")
    {
        context.remove("pnpmfileChecksum");
        context.insert(
            "overrides".into(),
            json!({"@teambit/legacy@*":"-","@teambit/harmony@*":"-"}),
        );
    }
    context
}

/// Merge shared resolution context keys ([`KEYS`]) from `existing` and `graph` into `merged`.
#[inline]
pub(super) fn merge(
    existing: &Map<String, Value>,
    graph: &Map<String, Value>,
    merged: &mut Map<String, Value>,
) {
    let existing_resolutions = has_resolutions(existing);
    if existing_resolutions && !has_resolutions(graph) {
        return;
    }
    for key in KEYS {
        let value = if existing_resolutions {
            existing
                .get(key)
                .filter(|value| Some(*value) == graph.get(key))
        } else {
            graph
                .get(key)
                .filter(|value| !value.is_null())
        };
        if let Some(value) = value {
            merged.insert(key.to_owned(), value.clone());
        } else {
            merged.remove(key);
        }
    }
}

/// Returns `true` when `lockfile` ([`Map`]) contains at least one entry in `"packages"` or `"snapshots"`.
#[inline]
fn has_resolutions(lockfile: &Map<String, Value>) -> bool {
    ["packages", "snapshots"]
        .iter()
        .any(|key| {
            lockfile
                .get(*key)
                .and_then(Value::as_object)
                .is_some_and(|rows| !rows.is_empty())
        })
}

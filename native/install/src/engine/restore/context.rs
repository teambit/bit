//! Preserve only the resolution settings shared by the graphs contributing packages.
#[cfg(test)]
mod oracle;
#[cfg(test)]
mod tests;

use serde_json::{Map, Value, json};

const KEYS: [&str; 3] = ["pnpmfileChecksum", "settings", "overrides"];

pub(super) fn graph(serialized: &Value) -> Map<String, Value> {
    let mut context = Map::new();
    for (source, target) in [
        ("pnpmfileChecksum", "pnpmfileChecksum"),
        ("lockfileSettings", "settings"),
        ("overrides", "overrides"),
    ] {
        if let Some(value) = serialized
            .get(source)
            .filter(|value| !value.is_null())
        {
            let normalized = value
                .as_str()
                .map_or_else(|| value.clone(), |text| Value::String(text.trim().to_owned()));
            context.insert(target.to_owned(), normalized);
        }
    }
    if serialized
        .get("pnpmfileChecksum")
        .and_then(Value::as_str)
        .map(str::trim)
        == Some("bit-1")
        && serialized["overrides"].is_null()
    {
        context.remove("pnpmfileChecksum");
        context.insert(
            "overrides".into(),
            json!({"@teambit/legacy@*":"-","@teambit/harmony@*":"-"}),
        );
    }
    context
}

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

//! Scope-aware identities and duplicate-name bitmap keys for imports.
use super::{Target, invalid};
use serde_json::{Map, Value};
use std::io;

pub(super) fn matches_target(row: &Value, target: &Target) -> bool {
    row["name"] == target.name && row["scope"].as_str() == target.scope.as_deref()
}

pub(super) fn bitmap_key(
    rows: &mut Map<String, Value>,
    name: &str,
    scope: &str,
) -> io::Result<String> {
    if !rows
        .values()
        .any(|row| row["name"] == name)
    {
        return Ok(name.to_owned());
    }
    let previous = std::mem::take(rows);
    for (key, row) in previous {
        let key = if row["name"] == name {
            format!(
                "{}/{name}",
                row["scope"].as_str().ok_or_else(|| invalid("inbound bitmap scope"))?,
            )
        } else {
            key
        };
        rows.insert(key, row);
    }
    Ok(format!("{scope}/{name}"))
}

pub(super) fn existing_mut<'a>(
    rows: &'a mut Map<String, Value>,
    target: &Target,
) -> io::Result<&'a mut Value> {
    rows.values_mut()
        .find(|row| matches_target(row, target))
        .ok_or_else(|| invalid("inbound existing bitmap"))
}

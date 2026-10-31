//! Scope-aware identities and duplicate-name bitmap keys for imports.
use super::{Target, invalid};
use serde_json::{Map, Value};
use std::io;

pub(super) fn matches_target(key: &str, row: &Value, target: &Target) -> bool {
    if key.starts_with('$') || matches!(key, "_bit_lane" | "version") || !row.is_object() {
        return false;
    }
    let (_, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    row_name == target.name && row["scope"].as_str() == target.scope.as_deref()
}

pub(super) fn bitmap_key(
    rows: &mut Map<String, Value>,
    name: &str,
    scope: &str,
) -> io::Result<String> {
    if !rows
        .iter()
        .any(|(key, row)| {
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
                && crate::reset_lane::bitmap::row_identity(key, row).1 == name
        })
    {
        return Ok(name.to_owned());
    }
    let previous = std::mem::take(rows);
    for (key, row) in previous {
        let is_same_name = !key.starts_with('$')
            && !matches!(key.as_str(), "_bit_lane" | "version")
            && row.is_object()
            && crate::reset_lane::bitmap::row_identity(&key, &row).1 == name;
        let key = if is_same_name {
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
    rows.iter_mut()
        .find_map(|(key, row)| matches_target(key, row, target).then_some(row))
        .ok_or_else(|| invalid("inbound existing bitmap"))
}

//! Scope-aware identities and duplicate-name bitmap keys for imports.
use super::{Target, invalid};
use serde_json::{Map, Value};
use std::io;

pub(super) fn matches_target(key: &str, row: &Value, target: &Target) -> bool {
    if !is_component_bitmap_entry(key, row) {
        return false;
    }
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    row_name.trim() == target.name.trim()
        && row_scope.map(str::trim) == target.scope.as_deref().map(str::trim)
}

fn is_component_bitmap_entry(key: &str, row: &Value) -> bool {
    !key.starts_with('$') && !matches!(key, "_bit_lane" | "version") && row.is_object()
}

pub(super) fn bitmap_key(
    rows: &mut Map<String, Value>,
    name: &str,
    scope: &str,
) -> io::Result<String> {
    if !rows
        .iter()
        .any(|(key, row)| {
            is_component_bitmap_entry(key, row)
                && crate::reset_lane::bitmap::row_identity(key, row).1 == name
        })
    {
        return Ok(name.to_owned());
    }
    let previous = std::mem::take(rows);
    for (key, row) in previous {
        let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(&key, &row);
        let is_same_name = is_component_bitmap_entry(&key, &row) && row_name == name;
        let key = if is_same_name {
            format!("{}/{name}", row_scope.ok_or_else(|| invalid("inbound bitmap scope"))?)
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

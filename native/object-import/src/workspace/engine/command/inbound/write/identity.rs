//! Scope-aware identities ([`matches_target`], [`Target`]) and duplicate-name `.bitmap` keys for imports.

use super::{Target, invalid};
use serde_json::{Map, Value};
use std::io;

pub(super) fn matches_target(key: &str, row: &Value, target: &Target) -> bool {
    if !is_component_bitmap_entry(key, row) {
        return false;
    }
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    let target_scope = target.scope
        .as_deref()
        .map(str::trim)
        .filter(|sc| !sc.is_empty());
    row_name.trim() == target.name.trim() && row_effective_scope(row_scope, row) == target_scope
}

#[inline]
fn row_effective_scope<'a>(row_scope: Option<&'a str>, row: &'a Value) -> Option<&'a str> {
    row_scope
        .map(str::trim)
        .filter(|sc| !sc.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|sc| !sc.is_empty())
        })
}

pub(super) fn has_unscoped_entry(rows: &Map<String, Value>, name: &str) -> bool {
    let name = name.trim();
    rows.iter()
        .any(|(key, row)| {
            if !is_component_bitmap_entry(key, row) {
                return false;
            }
            let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
            row_name.trim() == name && row_scope.map_or("", str::trim).is_empty()
        })
}

#[inline]
fn is_component_bitmap_entry(key: &str, row: &Value) -> bool {
    !key.starts_with('$') && !matches!(key, "_bit_lane" | "version") && row.is_object()
}

pub(super) fn bitmap_key(
    rows: &mut Map<String, Value>,
    name: &str,
    scope: &str,
) -> io::Result<String> {
    let (name, scope) = (name.trim(), scope.trim());
    if !rows
        .iter()
        .any(|(key, row)| {
            is_component_bitmap_entry(key, row)
                && crate::reset_lane::bitmap::row_identity(key, row).1.trim() == name
        })
    {
        return Ok(name.to_owned());
    }
    let previous = std::mem::replace(rows, Map::with_capacity(rows.len() + 1));
    for (key, row) in previous {
        let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(&key, &row);
        let is_same_name = is_component_bitmap_entry(&key, &row) && row_name.trim() == name;
        let key = if is_same_name {
            let row_scope = row_effective_scope(row_scope, &row)
                .ok_or_else(|| invalid("inbound bitmap scope"))?;
            format!("{row_scope}/{name}")
        } else {
            key
        };
        if rows.insert(key, row).is_some() {
            return Err(invalid("inbound duplicate bitmap key"));
        }
    }
    let target_key = format!("{scope}/{name}");
    if rows.contains_key(&target_key) {
        return Err(invalid("inbound duplicate bitmap key"));
    }
    Ok(target_key)
}

#[inline]
pub(super) fn existing_mut<'a>(
    rows: &'a mut Map<String, Value>,
    target: &Target,
) -> io::Result<&'a mut Value> {
    rows.iter_mut()
        .find_map(|(key, row)| matches_target(key, row, target).then_some(row))
        .ok_or_else(|| invalid("inbound existing bitmap"))
}

//! Bitmap keys disambiguate equal names without changing their component names.
use super::unsupported;
use serde_json::{Map, Value};
use std::io;

pub(super) fn scope(row: &Value) -> Option<&str> {
    row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
}
pub(super) fn row_name<'a>(key: &'a str, row: &'a Value) -> Option<&'a str> {
    let key = key.trim();
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    if let Some(name) = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        return Some(name);
    }
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    if let Some(row_scope) = scope(row) {
        return Some(
            key_id
                .strip_prefix(row_scope)
                .and_then(|rest| rest.strip_prefix('/'))
                .unwrap_or(key_id),
        );
    }
    Some(key_id.split_once('/').map_or(key_id, |(_, name)| name.trim()))
}
pub(super) fn find<'a>(
    bitmap: &'a Value,
    name: &str,
    selected_scope: Option<&str>,
) -> io::Result<Option<&'a Value>> {
    let mut found = None;
    for (key, row) in bitmap.as_object().ok_or_else(|| unsupported("tracking bitmap object"))? {
        if matches(row, key, name, selected_scope) {
            if found.is_some() {
                return Err(unsupported("tracking ambiguous component identity"));
            }
            found = Some(row);
        }
    }
    Ok(found)
}
fn matches(row: &Value, key: &str, name: &str, selected_scope: Option<&str>) -> bool {
    let name = name.trim();
    let Some(actual_name) = row_name(key, row) else {
        return false;
    };
    let full = scope(row).map(|scope| format!("{scope}/{actual_name}"));
    (name == actual_name || name == key.trim() || full.as_deref() == Some(name))
        && selected_scope
            .map(str::trim)
            .filter(|selected| !selected.is_empty())
            .is_none_or(|selected| scope(row) == Some(selected))
}

pub(super) fn publish(bitmap: &mut Value, row: Value) -> io::Result<()> {
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| unsupported("tracking component name"))?
        .to_owned();
    let selected = scope(&row).ok_or_else(|| unsupported("tracking component scope"))?.to_owned();
    let rows = bitmap.as_object_mut().ok_or_else(|| unsupported("tracking bitmap object"))?;
    rows.retain(|existing_key, existing| {
        row_name(existing_key, existing) != Some(name.as_str())
            || scope(existing) != Some(&selected)
    });
    rows.insert(format!("{selected}/{name}"), row);
    normalize(rows)
}
fn normalize(rows: &mut Map<String, Value>) -> io::Result<()> {
    let original = std::mem::take(rows);
    for (key, row) in &original {
        let Some(name) = row_name(key, row) else {
            rows.insert(key.clone(), row.clone());
            continue;
        };
        let duplicates = original
            .iter()
            .filter(|(other_key, other)| row_name(other_key, other) == Some(name))
            .count()
            > 1;
        let key = if duplicates {
            format!("{}/{name}", scope(row).ok_or_else(|| unsupported("tracking duplicate scope"))?)
        } else {
            name.into()
        };
        rows.insert(key, row.clone());
    }
    Ok(())
}

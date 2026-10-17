//! Bitmap keys disambiguate equal names without changing their component names.
use super::unsupported;
use serde_json::{Map, Value};
use std::io;

pub(super) fn scope(row: &Value) -> Option<&str> {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())
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
    let Some(actual_name) = row["name"].as_str() else {
        return false;
    };
    let full = scope(row).map(|scope| format!("{scope}/{actual_name}"));
    (name == actual_name || name == key || full.as_deref() == Some(name))
        && selected_scope.is_none_or(|selected| scope(row) == Some(selected))
}

pub(super) fn publish(bitmap: &mut Value, row: Value) -> io::Result<()> {
    let name = row["name"]
        .as_str()
        .ok_or_else(|| unsupported("tracking component name"))?
        .to_owned();
    let selected = scope(&row).ok_or_else(|| unsupported("tracking component scope"))?.to_owned();
    let rows = bitmap.as_object_mut().ok_or_else(|| unsupported("tracking bitmap object"))?;
    rows.retain(|_, existing| existing["name"] != name || scope(existing) != Some(&selected));
    rows.insert(format!("{selected}/{name}"), row);
    normalize(rows)
}
fn normalize(rows: &mut Map<String, Value>) -> io::Result<()> {
    let original = std::mem::take(rows);
    for (key, row) in &original {
        let Some(name) = row["name"].as_str() else {
            rows.insert(key.clone(), row.clone());
            continue;
        };
        let duplicates = original
            .values()
            .filter(|other| other["name"] == name)
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

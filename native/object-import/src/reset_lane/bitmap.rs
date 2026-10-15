//! Insert a staged soft-deleted component at `BitMap`'s component-key position.

use super::invalid;
use serde_json::{Map, Value};
use std::io;

pub(super) fn bitmap_key(rows: &Map<String, Value>, scope: &str, name: &str) -> io::Result<String> {
    let mut found = None;
    for (key, row) in rows {
        if key.starts_with('$') || key == "_bit_lane" || !row.is_object() {
            continue;
        }
        let row_scope = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .or_else(|| row["defaultScope"].as_str());
        if row_scope == Some(scope) && row["name"] == name && found.replace(key.clone()).is_some() {
            return Err(invalid("lane reset ambiguous bitmap identity"));
        }
    }
    found.ok_or_else(|| invalid("lane reset bitmap identity absent"))
}

pub(super) fn insert(rows: &mut Map<String, Value>, key: &str, row: Value) -> io::Result<()> {
    if rows.contains_key(key) || key.starts_with('$') || key == "_bit_lane" {
        return Err(invalid("lane reset restored bitmap key"));
    }
    let existing = std::mem::take(rows);
    let mut restored = Some(row);
    for (existing_key, value) in existing {
        if restored.is_some()
            && (existing_key.starts_with('$')
                || existing_key == "_bit_lane"
                || existing_key.as_str() > key)
        {
            rows.insert(
                key.to_owned(),
                restored.take().ok_or_else(|| invalid("lane reset restored row"))?,
            );
        }
        rows.insert(existing_key, value);
    }
    if let Some(row) = restored {
        rows.insert(key.to_owned(), row);
    }
    Ok(())
}

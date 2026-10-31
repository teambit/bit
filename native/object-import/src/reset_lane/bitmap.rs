//! Insert a staged soft-deleted component at `BitMap`'s component-key position.

use super::invalid;
use serde_json::{Map, Value};
use std::io;

pub(super) fn bitmap_key(rows: &Map<String, Value>, scope: &str, name: &str) -> io::Result<String> {
    let mut found = None;
    for (key, row) in rows {
        if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
            continue;
        }
        let (row_scope, row_name) = row_identity(key, row);
        if row_scope == Some(scope) && row_name == name && found.replace(key.clone()).is_some() {
            return Err(invalid("lane reset ambiguous bitmap identity"));
        }
    }
    found.ok_or_else(|| invalid("lane reset bitmap identity absent"))
}

pub(crate) fn row_identity<'a>(key: &'a str, row: &'a Value) -> (Option<&'a str>, &'a str) {
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    let explicit_scope = row["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|val| !val.is_empty())
        });
    let (row_scope, fallback_name) = if let Some(sc) = explicit_scope {
        let stripped = key_id
            .strip_prefix(sc)
            .and_then(|rest| rest.strip_prefix('/'))
            .unwrap_or(key_id);
        (Some(sc), stripped)
    } else {
        key_id
            .split_once('/')
            .map_or((None, key_id), |(sc, nm)| (Some(sc), nm))
    };
    let row_name = row["name"]
        .as_str()
        .filter(|val| !val.is_empty())
        .unwrap_or(fallback_name);
    (row_scope, row_name)
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

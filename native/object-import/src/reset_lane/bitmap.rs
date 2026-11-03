//! Insert a staged soft-deleted component at `BitMap` component-key position ([`bitmap_key`], [`row_identity`], [`insert`], [`should_insert_before`]).

use super::invalid;
use serde_json::{Map, Value};
use std::io;

/// Finds the unique `.bitmap` entry key matching `(scope, name)` or returns an error.
pub(super) fn bitmap_key(rows: &Map<String, Value>, scope: &str, name: &str) -> io::Result<String> {
    let mut found = None;
    for (key, row) in rows {
        if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
            continue;
        }
        let (row_scope, row_name) = row_identity(key, row);
        if (row_scope == Some(scope) || row_scope.is_none())
            && row_name == name
            && found.replace(key.as_str()).is_some()
        {
            return Err(invalid("lane reset ambiguous bitmap identity"));
        }
    }
    found.map(str::to_owned).ok_or_else(|| invalid("lane reset bitmap identity absent"))
}

/// Extracts `(scope, name)` from a `.bitmap` entry `key` and `row` object.
#[must_use]
pub(crate) fn row_identity<'a>(key: &'a str, row: &'a Value) -> (Option<&'a str>, &'a str) {
    let key = key.trim();
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    let explicit_scope = row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        });
    let (row_scope, fallback_name) = if let Some(sc) = explicit_scope {
        let stripped = key_id
            .strip_prefix(sc)
            .and_then(|rest| rest.strip_prefix('/'))
            .map_or(key_id, str::trim);
        (Some(sc), stripped)
    } else {
        key_id
            .split_once('/')
            .map_or((None, key_id), |(sc, nm)| (Some(sc.trim()), nm.trim()))
    };
    let row_name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(fallback_name);
    (row_scope, row_name)
}

/// Inserts restored component `row` at `key` into `.bitmap` `rows` in canonical key order.
pub(super) fn insert(rows: &mut Map<String, Value>, key: &str, row: Value) -> io::Result<()> {
    let key = key.trim();
    if key.starts_with('$')
        || key.contains('\0')
        || rows.contains_key(key)
        || matches!(key, "" | "_bit_lane" | "version" | "__proto__" | "constructor" | "prototype")
    {
        return Err(invalid("lane reset restored bitmap key"));
    }
    let existing = std::mem::replace(rows, Map::with_capacity(rows.len() + 1));
    let mut restored = Some(row);
    for (existing_key, value) in existing {
        if restored.is_some() && should_insert_before(&existing_key, key) {
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

/// Returns `true` when `existing_key` precedes `key` in canonical `.bitmap` property order.
#[inline]
fn should_insert_before(existing_key: &str, key: &str) -> bool {
    existing_key.starts_with('$')
        || existing_key == "_bit_lane"
        || existing_key == "version"
        || existing_key > key
}

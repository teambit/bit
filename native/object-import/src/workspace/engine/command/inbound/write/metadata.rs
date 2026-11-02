//! Preserve `.bitmap` schema and current-lane metadata ([`bitmap_metadata`]) across inbound writes.

#[cfg(test)]
mod tests;

use super::invalid;
use serde_json::{Map, Value};
use std::io;

/// Extracts and validates `$schema-version` and `_bit_lane` metadata from `.bitmap` `rows`.
pub(super) fn bitmap_metadata(rows: &mut Map<String, Value>) -> io::Result<(Value, Option<Value>)> {
    let Some(schema) = rows.shift_remove("$schema-version") else {
        return Err(invalid("inbound workspace bitmap lifecycle"));
    };
    if schema.as_str().map(str::trim) != Some("17.0.0") {
        return Err(invalid("inbound workspace bitmap lifecycle"));
    }
    let lane = rows.shift_remove("_bit_lane");
    if rows.len() > 4096 {
        return Err(invalid("inbound workspace bitmap lifecycle"));
    }
    if let Some(lane) = &lane {
        crate::command_import::lane::parse_lane_id(&lane["id"])?.validate()?;
        if !lane["exported"].is_boolean() {
            return Err(invalid("inbound workspace bitmap lane"));
        }
    }
    Ok((schema, lane))
}

/// The live `BitMap` keeps existing positions and appends new `ComponentMap` rows before disk sorting.
#[inline]
pub(super) fn component_order(
    root: &std::path::Path,
    rows: &Map<String, Value>,
) -> io::Result<Vec<String>> {
    let workspace = super::super::config::configuration(root)?;
    ordered_ids(rows, workspace["defaultScope"].as_str().map_or("", str::trim))
}
#[inline]
fn ordered_ids(rows: &Map<String, Value>, default_scope: &str) -> io::Result<Vec<String>> {
    rows.iter()
        .map(|(key, row)| {
            let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            let name = name.trim();
            if name.is_empty() {
                return Err(invalid("inbound ordered component name"));
            }
            let scope = row_scope
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .unwrap_or(default_scope);
            Ok(if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") })
        })
        .collect()
}

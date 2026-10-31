//! Preserve bitmap schema and current-lane metadata across inbound writes.
use super::invalid;
use serde_json::{Map, Value};
use std::io;

pub(super) fn bitmap_metadata(rows: &mut Map<String, Value>) -> io::Result<(Value, Option<Value>)> {
    if rows.get("$schema-version").and_then(Value::as_str) != Some("17.0.0") {
        return Err(invalid("inbound workspace bitmap lifecycle"));
    }
    let schema =
        rows.shift_remove("$schema-version").ok_or_else(|| invalid("inbound bitmap schema"))?;
    let lane = rows.shift_remove("_bit_lane");
    if let Some(lane) = &lane {
        let id = &lane["id"];
        crate::command_import::lane::Id {
            scope: id["scope"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            name: id["name"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
        }
        .validate()?;
        if !lane["exported"].is_boolean() {
            return Err(invalid("inbound workspace bitmap lane"));
        }
    }
    Ok((schema, lane))
}

/// The live `BitMap` keeps existing positions and appends new `ComponentMap` rows before disk sorting.
pub(super) fn component_order(
    root: &std::path::Path,
    rows: &Map<String, Value>,
) -> io::Result<Vec<String>> {
    let workspace = super::super::config::configuration(root)?;
    ordered_ids(rows, workspace["defaultScope"].as_str().unwrap_or_default())
}
fn ordered_ids(rows: &Map<String, Value>, default_scope: &str) -> io::Result<Vec<String>> {
    rows.iter()
        .map(|(key, row)| {
            let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            if name.is_empty() {
                return Err(invalid("inbound ordered component name"));
            }
            let scope = row_scope.unwrap_or(default_scope);
            Ok(if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") })
        })
        .collect()
}

#[cfg(test)]
mod tests;

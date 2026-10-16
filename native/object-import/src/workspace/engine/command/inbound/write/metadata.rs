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

//! `ScopeJson.toJson` uses four spaces and leaves the final newline absent.
use serde::Serialize;
use serde_json::Value;
use std::io;

/// Serialize a prepared scope document without changing its fields or insertion order.
pub fn render_scope_json(scope: &Value) -> io::Result<Vec<u8>> {
    let mut output = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);
    scope.serialize(&mut serializer).map_err(io::Error::other)?;
    Ok(output)
}

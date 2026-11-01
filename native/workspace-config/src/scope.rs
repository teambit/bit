//! `ScopeJson.toJson` uses four spaces and leaves the final newline absent.
use serde::Serialize;
use serde_json::Value;
use std::io;

const SCOPE_INDENT: &[u8] = b"    ";

/// Serialize a prepared scope document without changing its fields or insertion order.
#[inline]
pub fn render_scope_json(scope: &Value) -> io::Result<Vec<u8>> {
    if scope.is_null() {
        return Ok(b"{}".to_vec());
    }
    if !scope.is_object() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "scope.json must be an object"));
    }
    let mut output = Vec::with_capacity(128);
    let formatter = serde_json::ser::PrettyFormatter::with_indent(SCOPE_INDENT);
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);
    scope.serialize(&mut serializer).map_err(io::Error::other)?;
    Ok(output)
}

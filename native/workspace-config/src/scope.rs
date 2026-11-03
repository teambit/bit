//! `ScopeJson.toJson` [`render_scope_json`] serialization with four-space indentation and no trailing newline.
use serde::Serialize;
use serde_json::Value;
use std::io;

/// Four-space indentation unit used when serializing `scope.json` ([`Value`]) via [`render_scope_json`].
const SCOPE_INDENT: &[u8] = b"    ";

/// Serialize a prepared `scope` ([`Value`]) document with [`SCOPE_INDENT`] without changing its fields or insertion order.
///
/// Null values serialize as `b"{}"`, and non-object values return an `InvalidData` error.
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

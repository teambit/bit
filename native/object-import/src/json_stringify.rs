//! `JavaScript` `JSON.stringify` formatting ([`stringify_json`], [`convert`], [`convert_object`], [`Value`]) for JSON values captured by the native workspace engine.

use crate::js_json::{Value, stringify};
use std::io;

/// Serializes JSON `value` with `JavaScript` property ordering and `binary64` number formatting.
#[inline]
pub fn stringify_json(value: &serde_json::Value, pretty: bool) -> io::Result<String> {
    let bytes = stringify(&convert(value)?, pretty)?
        .ok_or_else(|| io::Error::other("JSON root undefined"))?;
    String::from_utf8(bytes).map_err(io::Error::other)
}

/// Converts a `serde_json::Value` tree into an accessor-free [`Value`] with `UTF-16` strings and `binary64` hex numbers.
fn convert(value: &serde_json::Value) -> io::Result<Value> {
    Ok(match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Boolean(*value),
        serde_json::Value::Number(value) => {
            let number = value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or_else(|| io::Error::other("JSON number"))?;
            Value::Number(format!("{:016x}", number.to_bits()))
        }
        serde_json::Value::String(value) => {
            if value.len() > 32 * 1024 * 1024 {
                return Err(io::Error::other("JSON string limit"));
            }
            Value::text(value)
        }
        serde_json::Value::Array(values) => {
            if values.len() > 262_144 {
                return Err(io::Error::other("JSON array limit"));
            }
            Value::Array(
                values
                    .iter()
                    .map(convert)
                    .collect::<io::Result<_>>()?,
            )
        }
        serde_json::Value::Object(values) => convert_object(values)?,
    })
}

/// Converts a `serde_json::Map` into an ordered `UTF-16`-keyed [`Value::Object`].
fn convert_object(values: &serde_json::Map<String, serde_json::Value>) -> io::Result<Value> {
    if values.len() > 262_144 {
        return Err(io::Error::other("JSON object limit"));
    }
    let mut entries = Vec::with_capacity(values.len());
    for (key, value) in values {
        if key.len() > 32768 {
            return Err(io::Error::other("JSON object key limit"));
        }
        let units = if key.is_ascii() {
            key.bytes().map(u16::from).collect()
        } else {
            key.encode_utf16().collect()
        };
        entries.push((units, convert(value)?));
    }
    Ok(Value::Object(entries))
}

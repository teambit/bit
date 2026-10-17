//! JavaScript stringify for JSON values captured by the native workspace engine.

use crate::js_json::{Value, stringify};
use std::io;

/// Serialize JSON data with JavaScript property ordering and binary64 numbers.
pub fn stringify_json(value: &serde_json::Value, pretty: bool) -> io::Result<String> {
    let bytes = stringify(&convert(value)?, pretty)?.expect("JSON has no undefined root");
    String::from_utf8(bytes).map_err(io::Error::other)
}

fn convert(value: &serde_json::Value) -> io::Result<Value> {
    Ok(match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Boolean(*value),
        serde_json::Value::Number(value) => {
            let number = value.as_f64().ok_or_else(|| io::Error::other("JSON number"))?;
            Value::Number(format!("{:016x}", number.to_bits()))
        }
        serde_json::Value::String(value) => Value::text(value),
        serde_json::Value::Array(values) => Value::Array(
            values
                .iter()
                .map(convert)
                .collect::<io::Result<_>>()?,
        ),
        serde_json::Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| Ok((key.encode_utf16().collect(), convert(value)?)))
                .collect::<io::Result<_>>()?,
        ),
    })
}

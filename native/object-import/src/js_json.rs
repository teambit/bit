#[path = "js_json/object.rs"]
mod object;
#[path = "js_json/string.rs"]
mod string;
#[path = "js_json/writer.rs"]
mod writer;

use serde::{Deserialize, Serialize};
use std::io;

/// Accessor-free JavaScript data, preserving undefined, UTF-16 and binary64 bits.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase", deny_unknown_fields)]
pub enum Value {
    Undefined,
    Null,
    Boolean(bool),
    Number(String),
    String(Vec<u16>),
    Array(Vec<Value>),
    Object(Vec<(Vec<u16>, Value)>),
}

impl Value {
    #[must_use]
    pub fn text(text: &str) -> Self {
        Self::String(text.encode_utf16().collect())
    }

    #[cfg(test)]
    #[must_use]
    pub fn number(value: f64) -> Self {
        Self::Number(format!("{:016x}", value.to_bits()))
    }

    pub fn truthy(&self) -> io::Result<bool> {
        Ok(match self {
            Self::Undefined | Self::Null => false,
            Self::Boolean(value) => *value,
            Self::Number(bits) => {
                let value = number(bits)?;
                value != 0.0 && !value.is_nan()
            }
            Self::String(value) => !value.is_empty(),
            Self::Array(_) | Self::Object(_) => true,
        })
    }

    pub fn empty(&self) -> io::Result<bool> {
        Ok(match self {
            Self::Array(value) => value.is_empty(),
            Self::Object(value) => {
                object::entries(value)?;
                value.is_empty()
            }
            Self::String(value) => value.is_empty(),
            Self::Number(bits) => {
                number(bits)?;
                true
            }
            _ => true,
        })
    }
}

pub fn stringify(value: &Value, pretty: bool) -> io::Result<Option<Vec<u8>>> {
    if matches!(value, Value::Undefined) {
        return Ok(None);
    }
    let mut writer = writer::Writer::new(pretty);
    writer.value(value, 0)?;
    Ok(Some(writer.finish()))
}

fn number(bits: &str) -> io::Result<f64> {
    if bits.len() != 16 || !bits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("invalid JavaScript number bits"));
    }
    let bits = u64::from_str_radix(bits, 16).map_err(io::Error::other)?;
    Ok(f64::from_bits(bits))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

//! Released `lynx` nullish default and N-API `u32` conversion for reporter milliseconds.
//!
//! Reproduces `napi_get_value_uint32` `ECMAScript` `ToUint32` semantics for `throttleProgress`.
#[cfg(test)]
mod tests;
use serde_json::Value;
use std::{io, time::Duration};

#[inline]
pub(super) fn throttle(value: Option<&Value>) -> io::Result<Option<Duration>> {
    let Some(value) = value else { return Ok(None) };
    let milliseconds = match value {
        Value::Null => return Ok(Some(Duration::from_millis(200))),
        Value::Number(number) => {
            if let Some(integer) = number
                .as_u64()
                .map(|num| num as u32)
                .or_else(|| number.as_i64().map(|num| num as u32))
            {
                integer
            } else {
                let float = number.as_f64().unwrap_or(f64::NAN);
                // napi_get_value_uint32 applies ECMAScript ToUint32, not Rust's saturating cast.
                if float.is_finite() {
                    const TWO_POW_32: f64 = 4_294_967_296.0;
                    float.trunc().rem_euclid(TWO_POW_32) as u32
                } else {
                    0
                }
            }
        }
        _ => return Err(invalid_type(value)),
    };
    Ok(Some(Duration::from_millis(u64::from(milliseconds))))
}

#[inline]
fn invalid_type(value: &Value) -> io::Error {
    let kind = match value {
        Value::Null => "Null",
        Value::String(_) => "String",
        Value::Bool(_) => "Boolean",
        Value::Number(_) => "Number",
        Value::Array(_) | Value::Object(_) => "Object",
    };
    io::Error::other(format!(
        "Failed to convert napi value {kind} into rust type `u32` on ReporterOptions.throttleProgress on InstallOptions.reporter",
    ))
}

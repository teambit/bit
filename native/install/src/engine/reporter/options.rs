//! Released lynx nullish default and N-API `u32` conversion for reporter milliseconds.
#[cfg(test)]
mod tests;
use serde_json::Value;
use std::{io, time::Duration};

pub(super) fn throttle(value: Option<&Value>) -> io::Result<Option<Duration>> {
    let Some(value) = value else { return Ok(None) };
    if value.is_null() {
        return Ok(Some(Duration::from_millis(200)));
    }
    let number = value.as_f64().ok_or_else(|| invalid_type(value))?;
    // napi_get_value_uint32 applies ECMAScript ToUint32, not Rust's saturating cast.
    let milliseconds = if number.is_finite() {
        const TWO_POW_32: f64 = 4_294_967_296.0;
        number.trunc().rem_euclid(TWO_POW_32) as u32
    } else {
        0
    };
    Ok(Some(Duration::from_millis(u64::from(milliseconds))))
}

fn invalid_type(value: &Value) -> io::Error {
    let kind = match value {
        Value::String(_) => "String",
        Value::Bool(_) => "Boolean",
        _ => "Object",
    };
    io::Error::other(format!(
        "Failed to convert napi value {kind} into rust type `u32` on ReporterOptions.throttleProgress on InstallOptions.reporter",
    ))
}

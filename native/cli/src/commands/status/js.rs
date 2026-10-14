//! JavaScript value semantics the status glue relied on, over `serde_json` values.

use serde_json::{Map, Value};
use std::io;

pub fn decline(reason: impl Into<String>) -> io::Error {
    io::Error::other(reason.into())
}

/// `value ?? fallback` sees `null` and `undefined` alike.
pub fn nullish(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| !value.is_null())
}

/// JavaScript truthiness.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(number)) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Some(Value::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

/// An array index key, which JavaScript objects order before every other
/// key. Values keyed that way would serialize in a different order than
/// they were inserted, so they decline.
fn index_like(key: &str) -> bool {
    key == "0"
        || (!key.starts_with('0') && !key.is_empty() && key.bytes().all(|b| b.is_ascii_digit()))
}

/// An object whose keys keep their insertion order in JavaScript too.
pub fn object(value: &Value) -> io::Result<&Map<String, Value>> {
    let map = value.as_object().ok_or_else(|| decline("status expected an object"))?;
    if map.keys().any(|key| index_like(key)) {
        return Err(decline("status index-like object key"));
    }
    Ok(map)
}

/// `map(value)` of the status policy: `undefined` is `{}`, anything but an
/// object of strings declines.
pub fn string_map(value: Option<&Value>) -> io::Result<Map<String, Value>> {
    let Some(value) = value else { return Ok(Map::new()) };
    let map = object(value).map_err(|_| decline("status complex dependency policy"))?;
    if map
        .values()
        .any(|value| !value.is_string())
    {
        return Err(decline("status complex dependency policy"));
    }
    Ok(map.clone())
}

/// `Object.assign(target, source)`: existing keys keep their position.
pub fn assign(target: &mut Map<String, Value>, source: &Map<String, Value>) {
    for (key, value) in source {
        target.insert(key.clone(), value.clone());
    }
}

/// `value ?? []` for an array field; anything else declines.
pub fn array<'v>(value: Option<&'v Value>, what: &str) -> io::Result<&'v [Value]> {
    match nullish(value) {
        None => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(decline(format!("status {what} is not an array"))),
    }
}

/// `String(value)` for the strings and absent values identities hold.
pub fn text(value: Option<&Value>) -> io::Result<&str> {
    match value {
        Some(Value::String(text)) => Ok(text),
        _ => Err(decline("status expected a string")),
    }
}

/// `target.identity + (target.version ? '@' + target.version : '')`.
pub fn full_identity(target: &Value) -> io::Result<String> {
    let identity = text(target.get("identity"))?;
    match target
        .get("version")
        .and_then(Value::as_str)
        .filter(|version| !version.is_empty())
    {
        Some(version) => Ok(format!("{identity}@{version}")),
        None => Ok(identity.to_string()),
    }
}

/// `identity.split('@')[0]`.
pub fn without_version(identity: &str) -> &str {
    identity
        .split('@')
        .next()
        .unwrap_or_default()
}

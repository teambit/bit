//! `JavaScript` value semantics the Node.js CLI relies on, over `serde_json` [`Value`] items.
//!
//! Exposes [`decline`], [`nullish`], [`truthy`], [`text`], [`array()`], [`object`], [`string_map`], and [`assign`] coercion helpers.

use serde_json::{Map, Value};
use std::io;

/// Constructs an [`io::Error`] indicating that native status execution should decline (`reason`) cleanly ([`object`], [`string_map`], [`array()`], [`text`]).
#[must_use]
#[inline]
pub fn decline(reason: impl Into<String>) -> io::Error {
    io::Error::other(reason.into())
}

/// Nullish coalescing helper (`value ?? fallback`) that treats `Some(Value::Null)` and `None` identically.
#[must_use]
#[inline]
pub fn nullish(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| !value.is_null())
}

/// Evaluates `JavaScript` truthiness of an optional JSON [`Value`].
#[must_use]
#[inline]
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

/// An array index key, which `JavaScript` objects order before every other
/// key (checked by [`object`]). Values keyed that way would serialize in a different order than
/// they were inserted, so they decline.
#[inline]
fn index_like(key: &str) -> bool {
    key == "0"
        || (!key.starts_with('0') && !key.is_empty() && key.bytes().all(|b| b.is_ascii_digit()))
}

/// An object whose keys keep their insertion order in `JavaScript` too ([`string_map`], [`assign`]).
#[inline]
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

/// `Object.assign(target, source)`: existing keys keep their position in `target` ([`Map`]).
#[inline]
pub fn assign(target: &mut Map<String, Value>, source: &Map<String, Value>) {
    for (key, value) in source {
        target.insert(key.clone(), value.clone());
    }
}

/// `value ?? []` for an array field; anything else declines.
#[inline]
pub fn array<'v>(value: Option<&'v Value>, what: &str) -> io::Result<&'v [Value]> {
    match nullish(value) {
        None => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(decline(format!("status {what} is not an array"))),
    }
}

/// `String(value)` for the strings and absent values identities hold.
#[inline]
pub fn text(value: Option<&Value>) -> io::Result<&str> {
    match value {
        Some(Value::String(text)) => Ok(text),
        _ => Err(decline("status expected a string")),
    }
}

/// `target.identity + (target.version ? '@' + target.version : '')` formatted for status outputs.
pub fn full_identity(target: &Value) -> io::Result<String> {
    let identity =
        match non_empty_str(target.get("identity")).or_else(|| non_empty_str(target.get("id"))) {
            Some(identity) => std::borrow::Cow::Borrowed(identity),
            None => std::borrow::Cow::Owned(base_target_identity(target)?),
        };
    if identity.contains('@') {
        return Ok(identity.into_owned());
    }
    match non_empty_str(target.get("version"))
        .or_else(|| non_empty_str(target.get("head")))
        .or_else(|| non_empty_str(target["id"].get("version")))
    {
        Some(version) => Ok(format!("{identity}@{version}")),
        None => Ok(identity.into_owned()),
    }
}

fn base_target_identity(target: &Value) -> io::Result<String> {
    let object = target["id"].as_object().ok_or_else(|| decline("status expected a string"))?;
    let name = text(object.get("name"))?.trim();
    if name.is_empty() {
        return Err(decline("status expected a string"));
    }
    match non_empty_str(object.get("scope")) {
        Some(scope) => Ok(format!("{scope}/{name}")),
        None => Ok(name.to_owned()),
    }
}

#[inline]
fn non_empty_str(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// `identity.split('@')[0]`.
#[must_use]
#[inline]
pub fn without_version(identity: &str) -> &str {
    let identity = identity.trim();
    identity
        .split_once('@')
        .filter(|(base, _)| !base.trim().is_empty())
        .map_or(identity, |(base, _)| base.trim())
}

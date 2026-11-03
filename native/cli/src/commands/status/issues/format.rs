//! String forms of issue data in status JSON.
//!
//! [`join`], [`list_or_text`], and [`item_text`] serialize issue [`Value`] payloads with [`array()`] and [`text`] into comma-separated strings.

use super::{array, text};
use serde_json::Value;
use std::io;

/// Joins the string elements of JSON [`array()`] `data` ([`Value`]) with `", "` (`array.join(', ')`) via [`item_text`].
#[inline]
pub(super) fn join(data: &Value) -> io::Result<String> {
    let items = array(Some(data), "issue data")?;
    if items.is_empty() {
        return Ok(String::new());
    }
    let items = items
        .iter()
        .map(item_text)
        .collect::<io::Result<Vec<_>>>()?;
    Ok(items.join(", "))
}

/// Formats `value` (`componentIssueToString`): arrays joined via [`join`], scalar values via [`item_text`].
#[inline]
pub(super) fn list_or_text(value: &Value) -> io::Result<String> {
    match value {
        Value::Array(_) => join(value),
        _ => item_text(value).map(str::to_owned),
    }
}

/// Extracts a display string from a JSON issue [`Value`] element (object field or string value via [`text`]).
#[inline]
fn item_text(value: &Value) -> io::Result<&str> {
    if let Some(object) = value.as_object()
        && let Some(found) =
            ["message", "id", "name", "componentId", "relativePath", "filePath", "path"]
                .into_iter()
                .find_map(|key| {
                    object
                        .get(key)
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|val| !val.is_empty())
                })
    {
        return Ok(found);
    }
    text(Some(value)).map(str::trim)
}

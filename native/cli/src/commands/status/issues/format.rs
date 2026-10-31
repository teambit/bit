//! String forms of issue data in status JSON.

use super::{array, text};
use serde_json::Value;
use std::io;

/// `array.join(', ')` of strings.
pub(super) fn join(data: &Value) -> io::Result<String> {
    let items = array(Some(data), "issue data")?;
    let items = items
        .iter()
        .map(item_text)
        .collect::<io::Result<Vec<_>>>()?;
    Ok(items.join(", "))
}

/// `componentIssueToString`: arrays joined, strings as they are.
pub(super) fn list_or_text(value: &Value) -> io::Result<String> {
    match value {
        Value::Array(_) => join(value),
        _ => item_text(value).map(str::to_owned),
    }
}

fn item_text(value: &Value) -> io::Result<&str> {
    if let Some(object) = value.as_object()
        && let Some(found) = object
            .get("message")
            .or_else(|| object.get("id"))
            .or_else(|| object.get("name"))
            .or_else(|| object.get("componentId"))
            .and_then(Value::as_str)
            .filter(|found| !found.trim().is_empty())
    {
        return Ok(found);
    }
    text(Some(value))
}

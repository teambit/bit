//! String forms of issue data in status JSON.

use super::{array, text};
use serde_json::Value;
use std::io;

/// `array.join(', ')` of strings.
pub(super) fn join(data: &Value) -> io::Result<String> {
    let items = array(Some(data), "issue data")?;
    let items = items
        .iter()
        .map(|item| text(Some(item)))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(items.join(", "))
}

/// `componentIssueToString`: arrays joined, strings as they are.
pub(super) fn list_or_text(value: &Value) -> io::Result<String> {
    match value {
        Value::String(text) => Ok(text.clone()),
        _ => join(value),
    }
}

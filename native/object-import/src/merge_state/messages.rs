//! Ordered `Version` log message extraction ([`read`], [`version_log_message`], [`references_valid`]) for squashed lane merges via [`crate::read_version::Reader`].

use super::squash::references_valid;
use serde_json::{Value, json};
use std::{io, path::Path};

/// Reads ordered `log.message` strings for `references` from the `Version` store at `directory` after [`references_valid`] validation.
pub(super) fn read(directory: &Path, references: &[String]) -> io::Result<Value> {
    crate::merge_history::path(directory)?;
    references_valid(references)?;
    if references.is_empty() {
        return Ok(json!({"messages":[]}));
    }
    let mut reader = crate::read_version::Reader::new(directory)?;
    let mut messages = Vec::with_capacity(references.len());
    for reference in references {
        let version = reader.read(reference.trim())?;
        messages.push(version_log_message(version));
    }
    Ok(json!({"messages":messages}))
}

/// Extracts `log.message` (or an empty string when absent) from a `Version` JSON [`Value`].
#[inline]
fn version_log_message(mut version: Value) -> Value {
    match version
        .get_mut("log")
        .and_then(|log| log.get_mut("message"))
        .map(Value::take)
    {
        Some(Value::String(message)) => Value::String(message),
        _ => Value::String(String::new()),
    }
}

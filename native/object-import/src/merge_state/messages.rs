use super::squash::references_valid;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn read(directory: &Path, references: &[String]) -> io::Result<Value> {
    references_valid(references)?;
    let mut reader = crate::read_version::Reader::new(directory)?;
    let mut messages = Vec::with_capacity(references.len());
    for reference in references {
        let version = reader.read(reference.trim())?;
        messages.push(json!(version_log_message(&version)));
    }
    Ok(json!({"messages":messages}))
}

fn version_log_message(version: &Value) -> &str {
    version
        .get("log")
        .and_then(|log| log.get("message"))
        .and_then(Value::as_str)
        .unwrap_or_default()
}

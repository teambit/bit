//! `GlobalConfig.load` reads strict JSON; native readers leave a missing file unwritten.
use serde_json::{Map, Value};
use std::{fs, io, path::Path};

/// Read `<directory>/config.json`, retaining ordinary JSON parsing diagnostics.
pub fn read_global_config(directory: &Path) -> io::Result<Value> {
    read_global_config_with(directory, |_, error| io::Error::other(error))
}

/// Preserve a caller's established parse-error report while sharing file and missing-file semantics.
pub fn read_global_config_with(
    directory: &Path,
    parse_error: impl FnOnce(&Path, serde_json::Error) -> io::Error,
) -> io::Result<Value> {
    if directory.as_os_str().is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    let path = directory.join("config.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(Value::Object(Map::new()));
        }
        Err(error) => return Err(error),
    };
    if text.trim().is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    serde_json::from_str(&text).map_err(|error| parse_error(&path, error))
}

/// Install's supported scalar setting projection preserves empty strings and boolean/number text.
#[must_use]
pub fn config_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Bool(_) | Value::Number(_) => Some(value.to_string()),
        _ => None,
    }
}

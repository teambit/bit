//! `GlobalConfig.load` [`read_global_config`] and [`read_global_config_with`] leave missing files unwritten.
use serde_json::{Map, Value};
use std::{fs, io, path::Path};

/// Read `<directory>/config.json` via [`read_global_config_with`], retaining ordinary JSON parsing diagnostics.
#[inline]
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
    let mut file = match fs::File::open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(Value::Object(Map::new()));
        }
        Err(error) => return Err(error),
    };
    let len = file.metadata()?.len();
    if len > 4 * 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "global config exceeds size limit"));
    }
    let mut text = String::with_capacity(usize::try_from(len).unwrap_or(0));
    io::Read::read_to_string(&mut file, &mut text)?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    if text.trim().is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    let parsed: Value = serde_json::from_str(text).map_err(|error| parse_error(&path, error))?;
    Ok(if parsed.is_null() { Value::Object(Map::new()) } else { parsed })
}

/// Install's supported scalar setting projection preserves empty strings and boolean/number text.
#[must_use]
#[inline]
pub fn config_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Bool(_) | Value::Number(_) => Some(value.to_string()),
        _ => None,
    }
}

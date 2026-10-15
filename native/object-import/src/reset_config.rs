//! Restore bitmap aspect settings saved by `version-maker.updateVersions` during a snap.

use serde_json::{Map, Value};
use std::{fs, io, path::Path};

pub(crate) fn read(
    root: &Path,
    lane: Option<(&str, &str)>,
    scope: &str,
    name: &str,
) -> io::Result<Option<Value>> {
    let path = file(root, lane)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("reset staged config oversized"));
    }
    let value: Value = serde_json::from_slice(&bytes)?;
    let rows = value
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("reset staged config rows"))?;
    let mut selected = None;
    for row in rows {
        if row["id"]["scope"] == scope
            && row["id"]["name"] == name
            && selected.replace(row).is_some()
        {
            return Err(invalid("reset duplicate staged config"));
        }
    }
    selected
        .and_then(|row| row.get("config"))
        .filter(|config| !config.is_null())
        .map(sanitized)
        .transpose()
}

pub(crate) fn restore(row: &mut Map<String, Value>, config: Option<Value>) {
    if !row.contains_key("config")
        && let Some(config) = config
    {
        row.insert("config".into(), config);
    }
}

fn sanitized(config: &Value) -> io::Result<Value> {
    let aspects = config.as_object().ok_or_else(|| invalid("reset staged aspect config"))?;
    let mut result = aspects.clone();
    for value in result.values_mut() {
        if let Some(fields) = value.as_object_mut() {
            fields.shift_remove("__specific");
        }
    }
    Ok(Value::Object(result))
}

fn file(root: &Path, lane: Option<(&str, &str)>) -> io::Result<std::path::PathBuf> {
    let base = root.join(".bit/staged-config");
    let Some((scope, name)) = lane else {
        return Ok(base.join("main.json"));
    };
    if [scope, name]
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == ".." || part.contains(['/', '\\']))
    {
        return Err(invalid("reset staged config path"));
    }
    Ok(base
        .join(scope)
        .join(format!("{name}.json")))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

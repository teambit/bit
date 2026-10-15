//! Bitmap projection and the staged-config boundary of `updateVersions`.

use super::{BytesChange, invalid};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) struct Bitmap {
    before: Vec<u8>,
    document: Value,
    key: String,
}

impl Bitmap {
    pub(super) fn load(root: &Path, scope: &str, name: &str) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let document = crate::recovery::jsonc::parse(&before)?;
        let fields = document.as_object().ok_or_else(|| invalid("reset bitmap"))?;
        if fields.contains_key("_bit_lane") {
            return Err(invalid("reset active lane"));
        }
        if fields
            .get("$schema-version")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(invalid("reset bitmap schema"));
        }
        let key = find_key(fields, scope, name)?;
        validate_row(root, &document[&key], scope, name)?;
        Ok(Self { before, document, key })
    }

    pub(super) fn project(mut self, version: String) -> io::Result<BytesChange> {
        let row =
            self.document[&self.key].as_object_mut().ok_or_else(|| invalid("reset bitmap row"))?;
        row.insert("version".into(), Value::String(version));
        row.shift_remove("nextVersion");
        let after = crate::inspection::render_bitmap(&self.document)?;
        Ok(BytesChange { before: self.before, after })
    }
}

pub(super) fn find_key(
    fields: &serde_json::Map<String, Value>,
    scope: &str,
    name: &str,
) -> io::Result<String> {
    let mut found = None;
    for (key, row) in fields {
        if key.starts_with('$') || !row.is_object() {
            continue;
        }
        let row_scope = row["scope"]
            .as_str()
            .filter(|value| !value.is_empty())
            .or_else(|| row["defaultScope"].as_str());
        if row_scope == Some(scope) && row["name"] == name && found.replace(key.clone()).is_some() {
            return Err(invalid("reset ambiguous bitmap identity"));
        }
    }
    found.ok_or_else(|| invalid("reset bitmap identity absent"))
}

fn validate_row(root: &Path, row: &Value, scope: &str, name: &str) -> io::Result<()> {
    if row["isAvailableOnCurrentLane"] == false
        || row["onLanesOnly"] == true
        || row["config"]["teambit.component/remove"]["removed"] == true
    {
        return Err(invalid("reset component unavailable on main"));
    }
    if row.get("config").is_none() && has_staged_config(root, scope, name)? {
        return Err(invalid("reset staged bitmap configuration"));
    }
    Ok(())
}

fn has_staged_config(root: &Path, scope: &str, name: &str) -> io::Result<bool> {
    let path = root.join(".bit/staged-config/main.json");
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    let value: Value = serde_json::from_slice(&bytes)?;
    let rows = value.as_array().ok_or_else(|| invalid("reset staged config rows"))?;
    Ok(rows
        .iter()
        .any(|row| {
            row["id"]["scope"] == scope && row["id"]["name"] == name && !row["config"].is_null()
        }))
}

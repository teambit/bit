//! Bitmap projection and the staged-config boundary of `updateVersions`.

use super::{BytesChange, invalid};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) struct Bitmap {
    before: Vec<u8>,
    document: Value,
    key: String,
    staged_config: Option<Value>,
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
        validate_row(&document[&key])?;
        let staged_config = crate::reset_config::read(root, None, scope, name)?;
        Ok(Self { before, document, key, staged_config })
    }

    pub(super) fn project(mut self, version: String) -> io::Result<BytesChange> {
        let row =
            self.document[&self.key].as_object_mut().ok_or_else(|| invalid("reset bitmap row"))?;
        row.insert("version".into(), Value::String(version));
        row.shift_remove("nextVersion");
        crate::reset_config::restore(row, self.staged_config);
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
        if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
            continue;
        }
        let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
        if row_scope == Some(scope) && row_name == name && found.replace(key.clone()).is_some() {
            return Err(invalid("reset ambiguous bitmap identity"));
        }
    }
    found.ok_or_else(|| invalid("reset bitmap identity absent"))
}

fn validate_row(row: &Value) -> io::Result<()> {
    if row["isAvailableOnCurrentLane"] == false || row["onLanesOnly"] == true {
        return Err(invalid("reset component unavailable on main"));
    }
    Ok(())
}

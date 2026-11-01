//! Scope index and Component deletion for a lane-only component reset.

use super::{BytesChange, ObjectChange, invalid, object_path, unique_position};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn remove_new_model(
    root: &Path,
    scope: &str,
    name: &str,
) -> io::Result<(ObjectChange, BytesChange)> {
    let scope_dir = crate::scope_path(root);
    let before = fs::read(scope_dir.join("index.json"))?;
    if before.len() > 16 * 1024 * 1024 {
        return Err(invalid("lane reset index budget"));
    }
    let mut index: Value = crate::parse_jsonc(&before)?;
    let rows =
        if index.is_array() { index.as_array_mut() } else { index["components"].as_array_mut() }
            .ok_or_else(|| invalid("lane reset index components"))?;
    let position = unique_position(rows, scope, name)?;
    let hash = rows[position]["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane reset model hash"))?;
    crate::merge_history::hash(hash)?;
    let hash = hash.to_owned();
    let model_bytes = fs::read(object_path(&scope_dir.join("objects"), &hash))?;
    if model_bytes.len() > 32 * 1024 * 1024 {
        return Err(invalid("lane reset model budget"));
    }
    let model = ObjectChange { hash, before: model_bytes, after: None };
    rows.remove(position);
    let mut after = serde_json::to_vec_pretty(&index)?;
    after.push(b'\n');
    Ok((model, BytesChange { before, after }))
}

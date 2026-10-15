//! Scope index and Component deletion for a lane-only component reset.

use super::{BytesChange, ObjectChange, invalid, object_path, unique_position};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn remove_new_model(
    root: &Path,
    scope: &str,
    name: &str,
) -> io::Result<(ObjectChange, BytesChange)> {
    let before = fs::read(root.join(".bit/index.json"))?;
    let mut index: Value = serde_json::from_slice(&before)?;
    let rows =
        index["components"].as_array_mut().ok_or_else(|| invalid("lane reset index components"))?;
    let position = unique_position(rows, scope, name)?;
    let hash = rows[position]["hash"]
        .as_str()
        .ok_or_else(|| invalid("lane reset model hash"))?
        .to_owned();
    crate::merge_history::hash(&hash)?;
    let model = ObjectChange {
        hash: hash.clone(),
        before: fs::read(object_path(&root.join(".bit/objects"), &hash))?,
        after: None,
    };
    rows.remove(position);
    let mut after = serde_json::to_vec_pretty(&index)?;
    after.push(b'\n');
    Ok((model, BytesChange { before, after }))
}

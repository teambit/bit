//! Rebuild the missing scope index at startup, before collection or restoration.
use super::repository::{Object, text};
use serde_json::{Value, json};
use std::{collections::BTreeMap, fs, io, path::Path};

pub(super) fn prepare(
    scope: &Path,
    objects: &BTreeMap<String, Object>,
) -> io::Result<Option<Vec<u8>>> {
    if existing(scope)? {
        return Ok(None);
    }
    let mut components = Vec::new();
    let mut lanes = Vec::new();
    for (hash, object) in objects {
        let value = &object.value;
        match object.kind.as_str() {
            "Component" => components.push(json!({"id":{"scope":value["scope"],"name":text(&value["name"])?},"isSymlink":false,"hash":hash})),
            "Lane" => lanes.push(lane(value, hash)?),
            _ => {}
        }
    }
    if components.is_empty() && lanes.is_empty() {
        return Ok(None);
    }
    let value: Value = json!({"components":components,"lanes":lanes});
    Ok(Some(format!("{}\n", serde_json::to_string_pretty(&value)?).into_bytes()))
}
fn lane(value: &Value, hash: &str) -> io::Result<Value> {
    let mut id = json!({"name":text(&value["name"])?});
    if let Some(scope) = value.get("scope") {
        id["scope"] = scope.clone();
    }
    Ok(json!({"id":id,"hash":hash}))
}
pub(super) fn write(scope: &Path, bytes: Option<&[u8]>) -> io::Result<()> {
    if let Some(bytes) = bytes {
        let path = scope.join("index.json");
        fs::write(&path, bytes)
            .map_err(|error| super::super::io_error::failure(error, "open", &path))?;
    }
    Ok(())
}

pub(super) fn existing(scope: &Path) -> io::Result<bool> {
    let path = scope.join("index.json");
    if path.exists() && !path.is_file() {
        return Err(super::repository::unsupported("scope index is not a file"));
    }
    Ok(path.exists())
}

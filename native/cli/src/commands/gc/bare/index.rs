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
            "Component" => components.push(component(value, hash)?),
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

fn component(value: &Value, hash: &str) -> io::Result<Value> {
    let name_value = if value["name"].is_string() { &value["name"] } else { &value["id"]["name"] };
    let name = text(name_value)?;
    let scope = normalized_scope(value).unwrap_or(Value::Null);
    let is_symlink = value["isSymlink"].as_bool().unwrap_or(false);
    Ok(json!({"id":{"scope":scope,"name":name},"isSymlink":is_symlink,"hash":hash}))
}

fn lane(value: &Value, hash: &str) -> io::Result<Value> {
    let name_value = if value["name"].is_string() { &value["name"] } else { &value["id"]["name"] };
    let mut id = json!({"name":text(name_value)?});
    if let Some(scope) = normalized_scope(value) {
        id["scope"] = scope;
    }
    Ok(json!({"id":id,"hash":hash}))
}

fn normalized_scope(value: &Value) -> Option<Value> {
    let raw = value
        .get("scope")
        .or_else(|| value["id"].get("scope"))?;
    if raw.is_null() {
        return None;
    }
    if let Some(scope) = raw.as_str() {
        let trimmed = scope.trim();
        return (!trimmed.is_empty()).then(|| Value::String(trimmed.to_owned()));
    }
    Some(raw.clone())
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
    Ok(path.is_file())
}

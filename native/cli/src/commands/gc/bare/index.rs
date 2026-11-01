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
    let mut bytes = serde_json::to_vec_pretty(&value)?;
    bytes.push(b'\n');
    Ok(Some(bytes))
}

fn component(value: &Value, hash: &str) -> io::Result<Value> {
    let name = text(&value["name"]).or_else(|_| text(&value["id"]["name"]))?;
    let scope = normalized_scope(value).unwrap_or(Value::Null);
    let is_symlink = value["isSymlink"].as_bool().unwrap_or(false);
    Ok(json!({"id":{"scope":scope,"name":name},"isSymlink":is_symlink,"hash":hash}))
}

fn lane(value: &Value, hash: &str) -> io::Result<Value> {
    let name = text(&value["name"]).or_else(|_| text(&value["id"]["name"]))?;
    let mut id = json!({"name":name});
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
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_file() => Ok(true),
        Ok(_) => Err(super::repository::unsupported("scope index is not a file")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

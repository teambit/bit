//! Validate JSON aspect facts returned by published callbacks without native object serialization.
use super::{array, invalid};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(in crate::workspace::engine::command) fn extensions(value: &Value) -> io::Result<Value> {
    let mut identities = HashSet::new();
    for row in array(value)? {
        let object = row.as_object().ok_or_else(|| invalid("snapshot callback aspect"))?;
        if object
            .keys()
            .any(|key| !matches!(key.as_str(), "name" | "extensionId" | "config" | "data"))
        {
            return Err(invalid("snapshot callback aspect fields"));
        }
        if !identities.insert(identity(row)?)
            || !row["data"].is_object()
            || (!row["config"].is_object() && row["config"] != "-")
        {
            return Err(invalid("snapshot callback aspect data"));
        }
    }
    Ok(value.clone())
}

fn identity(row: &Value) -> io::Result<String> {
    if let Some(name) = row["name"].as_str().map(str::trim) {
        if row.get("extensionId").is_some()
            || !name
                .split_once('/')
                .is_some_and(|(scope, part)| !scope.trim().is_empty() && !part.trim().is_empty())
        {
            return Err(invalid("snapshot callback core identity"));
        }
        return Ok(name.to_owned());
    }
    if let Some(raw) = row["extensionId"].as_str().map(str::trim) {
        let base = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
        let (scope, name) = base
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("snapshot callback extension identity"))?;
        return Ok(format!("{scope}/{name}"));
    }
    object_identity(row)
}

fn object_identity(row: &Value) -> io::Result<String> {
    let id = row["extensionId"]
        .as_object()
        .ok_or_else(|| invalid("snapshot callback extension identity"))?;
    let scope = id
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .ok_or_else(|| invalid("snapshot callback extension scope"))?;
    let name = id
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .ok_or_else(|| invalid("snapshot callback extension name"))?;
    if scope.is_empty()
        || name.is_empty()
        || id
            .keys()
            .any(|key| !matches!(key.as_str(), "scope" | "name" | "version"))
        || id
            .get("version")
            .is_some_and(|version| {
                version
                    .as_str()
                    .map(str::trim)
                    .is_none_or(str::is_empty)
            })
    {
        return Err(invalid("snapshot callback extension identity"));
    }
    Ok(format!("{scope}/{name}"))
}

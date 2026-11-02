//! Validate JSON aspect facts returned by published callbacks via [`extensions`], [`identity`], and [`object_identity`].

use super::{array, invalid};
use serde_json::Value;
use std::{collections::HashSet, io};

/// Validates callback-returned aspect extension rows for unique identities and schema fields.
#[inline]
pub(in crate::workspace::engine::command) fn extensions(value: &Value) -> io::Result<Value> {
    let rows = array(value)?;
    let mut identities = HashSet::with_capacity(rows.len());
    for row in rows {
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

/// Extracts and validates the normalized `scope/name` aspect identity from a callback `row`.
#[inline]
fn identity(row: &Value) -> io::Result<String> {
    if row
        .get("name")
        .is_some_and(|val| !val.is_null() && !val.is_string())
    {
        return Err(invalid("snapshot callback core identity"));
    }
    if let Some(name) = row["name"].as_str().map(str::trim) {
        if row
            .get("extensionId")
            .is_some_and(|val| !val.is_null())
        {
            return Err(invalid("snapshot callback core identity"));
        }
        let (scope, part) = name
            .split_once('/')
            .map(|(scope, part)| (scope.trim(), part.trim()))
            .filter(|(scope, part)| !scope.is_empty() && !part.is_empty())
            .ok_or_else(|| invalid("snapshot callback core identity"))?;
        return Ok(format!("{scope}/{part}"));
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

/// Extracts and validates a `scope/name` aspect identity from an object-valued `row["extensionId"]` for [`identity`].
#[inline]
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

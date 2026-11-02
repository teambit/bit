//! Merged component dependency version alignment ([`rows`], [`identity`], [`candidates`], [`hashes`]) and workspace availability filtering.

use super::invalid;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
/// Extracts a bounded array slice for `field` from `input` (at most 4,096 dependency rows).
#[inline]
fn rows<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    Ok(input[field]
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("merge dependency count"))?)
}
/// Extracts the `(scope, name)` tuple from a dependency object or string identifier.
fn identity(value: &Value) -> io::Result<(Option<&str>, &str)> {
    let target = value.get("id").unwrap_or(value);
    if let Some(raw) = target.as_str() {
        return string_identity(raw);
    }
    let scope = match target.get("scope") {
        None | Some(Value::Null) => None,
        Some(Value::String(scope)) if scope.trim().len() <= 4096 && !scope.contains('\0') => {
            Some(scope.trim()).filter(|scope| !scope.is_empty())
        }
        _ => return Err(invalid("merge dependency scope")),
    };
    let name = target["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty() && name.len() <= 4096 && !name.contains('\0'))
        .ok_or_else(|| invalid("merge dependency name"))?;
    Ok((scope, name))
}
/// Splits a `[scope/]name[@version]` string into a validated `(scope, name)` tuple.
fn string_identity(raw: &str) -> io::Result<(Option<&str>, &str)> {
    let raw = raw.trim();
    let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
    let (scope, name) = match bare.split_once('/') {
        Some((scope, name)) => {
            let scope = scope.trim();
            if scope.is_empty() {
                return Err(invalid("merge dependency scope"));
            }
            (Some(scope), name.trim())
        }
        None => (None, bare),
    };
    if name.is_empty()
        || name.len() > 4096
        || name.contains('\0')
        || scope.is_some_and(|sc| sc.len() > 4096 || sc.contains('\0'))
    {
        return Err(invalid("merge dependency name"));
    }
    Ok((scope, name))
}
/// Extracts a set of validated SHA-1 version hash strings from `input[field]`.
fn hashes<'a>(input: &'a Value, field: &str) -> io::Result<HashSet<&'a str>> {
    rows(input, field)?
        .iter()
        .map(|value| {
            let hash = value
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("merge dependency hash"))?;
            crate::merge_history::hash(hash)?;
            Ok(hash)
        })
        .collect()
}
/// Extracts the trimmed version string from `dependency["version"]` or the `@version` suffix of `dependency["id"]`.
fn dependency_version(dependency: &Value) -> Option<&str> {
    if let Some(ver) = dependency.get("version").and_then(Value::as_str) {
        return Some(ver.trim());
    }
    let raw = dependency
        .get("id")
        .unwrap_or(dependency)
        .as_str()?;
    raw.trim()
        .rsplit_once('@')
        .map(|(_, ver)| ver.trim())
}
pub(super) fn candidates(input: &Value) -> io::Result<Value> {
    let scope = identity(&input["owner"])?.0;
    let mut checked = hashes(input, "checked")?;
    let dependencies = rows(input, "dependencies")?;
    let mut added = Vec::with_capacity(dependencies.len());
    let mut selected = Vec::with_capacity(dependencies.len());
    for (index, dependency) in dependencies.iter().enumerate() {
        if identity(dependency)?.0 != scope {
            continue;
        }
        let Some(hash) =
            dependency_version(dependency).filter(|hash| crate::merge_history::hash(hash).is_ok())
        else {
            continue;
        };
        if checked.insert(hash) {
            selected.push(index);
            added.push(hash);
        }
    }
    Ok(json!({"selected":selected,"checked":added}))
}
pub(super) fn missing(input: &Value) -> io::Result<Value> {
    let existing = hashes(input, "existing")?;
    let candidates = rows(input, "candidates")?;
    let mut missing = Vec::with_capacity(candidates.len());
    for (index, value) in candidates.iter().enumerate() {
        let hash = value
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("merge missing hash"))?;
        crate::merge_history::hash(hash)?;
        if !existing.contains(hash) {
            missing.push(index);
        }
    }
    Ok(json!({"missing":missing}))
}
pub(super) fn pattern(input: &Value) -> io::Result<Value> {
    let excluded = rows(input, "excluded")?
        .iter()
        .map(identity)
        .collect::<io::Result<HashSet<_>>>()?;
    let dependencies = rows(input, "dependencies")?;
    let mut selected = Vec::with_capacity(dependencies.len());
    for (index, dependency) in dependencies.iter().enumerate() {
        if excluded.contains(&identity(dependency)?) {
            selected.push(index);
        }
    }
    Ok(json!({"selected":selected}))
}

pub(super) fn outcome(input: &Value) -> io::Result<Value> {
    let has = super::decision::boolean(input, "hasDependencies")?;
    let include = super::decision::boolean(input, "includeDeps")?;
    let action = if !has {
        "none"
    } else if include {
        "add"
    } else if super::decision::boolean(input, "headMatches")? {
        "head"
    } else {
        "history"
    };
    Ok(json!({"action":action}))
}

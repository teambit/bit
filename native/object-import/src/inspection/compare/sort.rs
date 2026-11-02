//! Deterministic array and map key sorting ([`rows`], [`all`]) for semantic `Version` comparisons.

use super::{super::invalid, fields};
use crate::js_json::Value as Js;
use serde_json::{Value, json};
use std::io;

/// Sorts array `field` on `value` by `key` and returns the original element indices.
pub(super) fn rows(
    value: &mut Js,
    field: &str,
    key: impl Fn(&Js) -> io::Result<Vec<u16>>,
) -> io::Result<Vec<usize>> {
    let original = fields::array(fields::get(value, field))?;
    if original.len() > 4096 {
        return Err(invalid("inspection compare row budget"));
    }
    let mut order = original
        .iter()
        .enumerate()
        .map(|(index, row)| Ok((key(row)?, index, row.clone())))
        .collect::<io::Result<Vec<_>>>()?;
    order.sort_by(|left, right| left.0.cmp(&right.0));
    let (indices, sorted): (Vec<_>, Vec<_>) = order
        .into_iter()
        .map(|(_, index, row)| (index, row))
        .unzip();
    fields::set(value, field, Js::Array(sorted))?;
    Ok(indices)
}
/// Sorts files, dependencies, extensions, package maps, and overrides on `value` for comparison.
pub(super) fn all(value: &mut Js) -> io::Result<Value> {
    let files = rows(value, "files", |row| fields::text(fields::get(row, "relativePath")))?;
    let dependencies = rows(value, "dependencies", |row| fields::id(fields::get(row, "id"), true))?;
    let dev = rows(value, "devDependencies", |row| fields::id(fields::get(row, "id"), true))?;
    let extensions = rows(value, "extensions", extension_id)?;
    let package_keys = maps(value)?;
    let override_keys = overrides(value)?;
    Ok(
        json!({"fileOrder":files,"dependencyOrder":dependencies,"devDependencyOrder":dev,"extensionOrder":extensions,"packageKeys":package_keys,"overrideKeys":override_keys}),
    )
}
/// Extracts the canonical `UTF-16` sort key for an extension entry `row`.
#[inline]
fn extension_id(row: &Js) -> io::Result<Vec<u16>> {
    let id = fields::get(row, "extensionId");
    if id.truthy()? {
        if let Js::String(text) = id {
            return Ok(text.clone());
        }
        return fields::id(id, true);
    }
    for name in ["name", "legacyId", "stringId"] {
        let candidate = fields::get(row, name);
        if candidate.truthy()? {
            return fields::text(candidate);
        }
    }
    Ok(Vec::new())
}
fn keys(value: &mut Js) -> io::Result<Vec<Vec<u16>>> {
    let Js::Object(entries) = value else {
        return Err(invalid("inspection sortable map required"));
    };
    if entries.len() > 4096 {
        return Err(invalid("inspection compare row budget"));
    }
    if entries
        .iter()
        .any(|(key, _)| key.is_empty() || key.len() > 32768)
    {
        return Err(invalid("inspection sortable map key budget"));
    }
    if entries
        .iter()
        .any(|(key, _)| {
            key.iter()
                .copied()
                .eq("__proto__".encode_utf16())
        })
    {
        return Err(invalid("inspection prototype sorter fallback"));
    }
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(entries
        .iter()
        .map(|(key, _)| key.clone())
        .collect())
}
fn maps(value: &mut Js) -> io::Result<Value> {
    let mut output = serde_json::Map::with_capacity(3);
    for field in ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"] {
        let mut map = fields::get(value, field).clone();
        let order = keys(&mut map)?;
        output.insert(field.into(), json!(order));
        fields::set(value, field, map)?;
    }
    Ok(Value::Object(output))
}
fn overrides(value: &mut Js) -> io::Result<Value> {
    let mut overrides = fields::get(value, "overrides").clone();
    let mut output = serde_json::Map::new();
    if !overrides.truthy()? {
        return Ok(Value::Object(output));
    }
    if !matches!(overrides, Js::Object(_)) {
        return Err(invalid("inspection sortable map required"));
    }
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let mut map = fields::get(&overrides, field).clone();
        if map.truthy()? {
            output.insert(field.into(), json!(keys(&mut map)?));
            fields::set(&mut overrides, field, map)?;
        }
    }
    fields::set(value, "overrides", overrides)?;
    Ok(Value::Object(output))
}

//! Tracked file removal filtering ([`apply`], [`relative_path`], [`removed_entry`], [`status`], [`boolean`]) and `.bitmap` preservation during merge materialization.

use super::{decision::boolean, invalid};
use serde_json::{Value, json};
use std::io;
/// Extracts and validates the non-empty relative path from a current component `file` descriptor.
#[inline]
fn relative_path(file: &Value) -> io::Result<&str> {
    file.as_str()
        .or_else(|| file["relativePath"].as_str())
        .or_else(|| file["path"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 32768 && !value.contains('\0'))
        .ok_or_else(|| invalid("merge current relative path"))
}
/// Returns the removal path JSON string (`file["path"]` when non-empty, or `path`).
#[inline]
fn removed_entry(file: &Value, path: &str) -> Value {
    let entry = file["path"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(path);
    Value::String(entry.to_owned())
}
/// Filters `current` component [`Value`] files via [`status`] for `"removed"` status entries while preserving root `.bitmap`.
pub(super) fn apply(input: &Value, current: &[Value]) -> io::Result<Value> {
    let statuses = input["filesStatus"]
        .as_array()
        .filter(|rows| rows.len() <= 8192)
        .ok_or_else(|| invalid("merge removal statuses"))?;
    if !boolean(input, "tracked")? {
        return Ok(json!({"filesStatus":statuses,"removals":[]}));
    }
    let root = boolean(input, "workspaceRoot")?;
    let mut statuses = statuses.clone();
    let mut removed = Vec::new();
    for file in current {
        let path = relative_path(file)?;
        if !(root && path == ".bitmap") && status(&mut statuses, path)? == "removed" {
            removed.push(removed_entry(file, path));
        }
    }
    Ok(json!({"filesStatus":statuses,"removals":removed}))
}

/// Looks up or appends the `"removed"` status for `path` in `statuses`, rejecting prototype property names.
fn status<'a>(statuses: &'a mut Vec<Value>, path: &str) -> io::Result<&'a str> {
    let found = statuses
        .iter()
        .position(|row| {
            row["relativePath"].as_str().map(str::trim) == Some(path)
                || row["path"].as_str().map(str::trim) == Some(path)
        });
    let status = if let Some(index) = found {
        statuses[index]["status"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .ok_or_else(|| invalid("merge file status"))?
    } else {
        if [
            "__proto__",
            "constructor",
            "toString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "toLocaleString",
            "__defineGetter__",
            "__defineSetter__",
            "__lookupGetter__",
            "__lookupSetter__",
        ]
        .contains(&path)
        {
            return Err(invalid("merge inherited file status"));
        }
        statuses.push(json!({"relativePath":path,"status":"removed"}));
        "removed"
    };
    Ok(status)
}

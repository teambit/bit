//! `.bitmap` root-directory diffing ([`plan`], [`roots`], [`root`], [`identity`], [`jsonc`], [`path`]) and removal planning for workspace recovery.

use super::{invalid, jsonc, path};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::File,
    io::{self, Read},
    path::Path,
};

/// Diffs `.bitmap` at `filename` against `current` component root directories for crash recovery.
pub(super) fn plan(filename: &Path, current: &[String]) -> io::Result<Value> {
    path(filename)?;
    if current.len() > 4096
        || current
            .iter()
            .any(|dir| !directory(dir.trim()))
    {
        return Err(invalid("bitmap current roots"));
    }
    let link_meta = std::fs::symlink_metadata(filename)?;
    if link_meta.file_type().is_symlink() || !link_meta.is_file() {
        return Err(invalid("bitmap file"));
    }
    let file = File::open(filename)?;
    if !file.metadata()?.is_file() {
        return Err(invalid("bitmap file"));
    }
    let mut bytes = Vec::with_capacity(
        usize::try_from(link_meta.len())
            .unwrap_or(0)
            .min(4 * 1024 * 1024 + 1),
    );
    file.take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(invalid("bitmap budget"));
    }
    let parsed = jsonc::parse(&bytes)?;
    let previous = roots(&parsed)?;
    let remove: Vec<_> = current
        .iter()
        .filter(|dir| !previous.contains(dir.trim()))
        .collect();
    Ok(json!({"removeDirs":remove}))
}
/// Extracts and validates unique component `rootDir` entries from a parsed `.bitmap` JSON `value`.
fn roots(value: &Value) -> io::Result<HashSet<&str>> {
    let entries = value.as_object().ok_or_else(|| invalid("bitmap object"))?;
    if entries.len() > 4098 {
        return Err(invalid("bitmap component budget"));
    }
    let schema = entries.get("$schema-version").is_some_and(truthy);
    let mut roots = HashSet::with_capacity(entries.len());
    for (key, component) in entries {
        let key = key.trim();
        if key == "_bit_lane" || key == if schema { "$schema-version" } else { "version" } {
            continue;
        }
        identity(key, component)?;
        let root = root(component)?;
        if !roots.insert(root) {
            return Err(invalid("bitmap duplicate root"));
        }
    }
    lane(value)?;
    Ok(roots)
}
/// Extracts and validates the relative `rootDir` (defaulting to `"."`) from `.bitmap` `component`.
fn root(component: &Value) -> io::Result<&str> {
    let root = match component.get("rootDir") {
        Some(Value::String(root)) if !root.trim().is_empty() => root.trim(),
        Some(Value::Null | Value::String(_)) | None => ".",
        _ => return Err(invalid("bitmap root type")),
    };
    if !directory(root) {
        return Err(invalid("bitmap unsupported root"));
    }
    Ok(root)
}

/// Validates the `scope` and `name` fields of a `.bitmap` `component` entry under `key`.
fn identity(key: &str, component: &Value) -> io::Result<()> {
    let object = component.as_object().ok_or_else(|| invalid("bitmap component"))?;
    let scope = object.get("scope").ok_or_else(|| invalid("bitmap missing scope"))?;
    if component
        .get("name")
        .is_some_and(|name| !name.is_null() && !name.is_string())
    {
        return Err(invalid("bitmap name type"));
    }
    let (_, name) = crate::reset_lane::bitmap::row_identity(key, component);
    if !identifier(name, true) {
        return Err(invalid("bitmap component name"));
    }
    if scope
        .as_str()
        .is_some_and(|val| val.trim().is_empty())
        || scope.is_null()
    {
        component["defaultScope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| scope_text(scope))
            .ok_or_else(|| invalid("bitmap missing default scope"))?;
    } else {
        scope
            .as_str()
            .map(str::trim)
            .filter(|scope| scope_text(scope))
            .ok_or_else(|| invalid("bitmap scope"))?;
        let version = component["version"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("bitmap scoped version"))?;
        if !version_text(version) {
            return Err(invalid("bitmap version"));
        }
    }
    Ok(())
}
fn version_text(value: &str) -> bool {
    if value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return true;
    }
    let mut parts = value.split('.');
    let valid_part = |part: Option<&str>| {
        part.is_some_and(|text| !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit()))
    };
    valid_part(parts.next())
        && valid_part(parts.next())
        && valid_part(parts.next())
        && parts.next().is_none()
}
fn identifier(value: &str, namespaced: bool) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && value
            .split('/')
            .all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || matches!(byte, b'-' | b'_')
                                || (!namespaced && byte == b'.')
                        })
            })
}
fn directory(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32768
        && !value.contains('\0')
        && !value
            .split(['/', '\\'])
            .any(|part| matches!(part, "" | "." | ".."))
        && !matches!(
            value,
            "__proto__"
                | "constructor"
                | "prototype"
                | "toString"
                | "valueOf"
                | "hasOwnProperty"
                | "isPrototypeOf"
                | "propertyIsEnumerable"
                | "toLocaleString"
                | "__defineGetter__"
                | "__defineSetter__"
                | "__lookupGetter__"
                | "__lookupSetter__",
        )
}
fn lane(value: &Value) -> io::Result<()> {
    if let Some(lane) = value.get("_bit_lane").filter(|value| truthy(value)) {
        let valid =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                lane,
            )
            .is_some_and(|(scope, name)| scope_text(scope) && identifier(name, true));
        if !valid {
            return Err(invalid("bitmap lane"));
        }
    }
    Ok(())
}

#[inline]
fn truthy(value: &Value) -> bool {
    !value.is_null() && value != false && value != "" && value != 0
}

#[inline]
fn scope_text(value: &str) -> bool {
    value.len() >= 2
        && value.len() <= 4096
        && !value.starts_with('.')
        && !value.ends_with('.')
        && value
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
        && value
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'-' | b'_' | b'.')
            })
}

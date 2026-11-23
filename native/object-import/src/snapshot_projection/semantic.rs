//! Canonical semantic JSON payload and `SHA-1` digest computation ([`Semantic`], [`semantic`], [`retain`], [`files`], [`dependencies`]) for `Version` objects.

#[path = "semantic_extensions.rs"]
mod extensions;

use sha1::{Digest, Sha1};
use std::io;

use super::{choose, get, hexadecimal, invalid, object, text};
use crate::js_json::{Value, stringify};

/// Canonical semantic JSON bytes, SHA-1 `hash`, and sorted extension config assignments for a `Version`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Semantic {
    pub bytes: Vec<u8>,
    pub hash: String,
    pub config_assignments: Vec<(usize, Value)>,
}

/// Compute the canonical semantic JSON payload and SHA-1 hash for a `Version` via [`files`], [`dependencies`], and [`retain`].
pub fn semantic(fields: &Value) -> io::Result<Semantic> {
    object(fields)?;
    let (configs, assignments) = extensions::configs(get(fields, "extensions"))?;
    let mut configs = Some(configs);
    let mut output = Vec::with_capacity(12);
    for name in [
        "mainFile",
        "files",
        "log",
        "dependencies",
        "devDependencies",
        "extensionDependencies",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "bindingPrefix",
        "overrides",
        "extensions",
    ] {
        let value = match name {
            "files" => files(get(fields, name))?,
            "log" => choose(get(fields, name), &["message", "date", "username", "email"], false)?,
            "dependencies" | "devDependencies" => dependencies(get(fields, name))?,
            "extensionDependencies" => extensions::dependencies(get(fields, "extensions"))?,
            "extensions" => configs.take().unwrap_or(Value::Undefined),
            _ => get(fields, name).clone(),
        };
        if retain(name, &value)? {
            output.push((name.encode_utf16().collect(), value));
        }
    }
    let bytes = stringify(&Value::Object(output), false)?.expect("object serializes");
    Ok(Semantic {
        hash: hexadecimal(&Sha1::digest(&bytes)),
        bytes,
        config_assignments: assignments,
    })
}

/// Returns `true` when semantic property `name` with `value` ([`Value`]) should be included in the hashed `Version` object.
fn retain(name: &str, value: &Value) -> io::Result<bool> {
    if matches!(
        name,
        "devDependencies"
            | "extensionDependencies"
            | "devPackageDependencies"
            | "peerPackageDependencies"
            | "overrides"
            | "extensions",
    ) {
        Ok(!value.empty()?)
    } else {
        value.truthy()
    }
}

/// Projects `Version` `files` rows into canonical `("file", "relativePath", "name", "test")` order.
fn files(value: &Value) -> io::Result<Value> {
    let Value::Array(rows) = value else {
        return Err(invalid("Version files required"));
    };
    if rows.len() > 65536 {
        return Err(invalid("Version files limit"));
    }
    Ok(Value::Array(
        rows.iter()
            .map(|row| {
                object(row)?;
                choose(row, &["file", "relativePath", "name", "test"], false)
            })
            .collect::<io::Result<_>>()?,
    ))
}

/// Projects `dependencies` or `devDependencies` rows into canonical field order for semantic hashing.
fn dependencies(value: &Value) -> io::Result<Value> {
    let Value::Array(rows) = value else {
        return Err(invalid("dependencies required"));
    };
    if rows.len() > 65536 {
        return Err(invalid("dependencies limit"));
    }
    Ok(Value::Array(
        rows.iter()
            .map(|row| {
                object(row)?;
                Ok(Value::Object(vec![(
                    "id".encode_utf16().collect(),
                    Value::text(&component_id(get(row, "id"))?),
                )]))
            })
            .collect::<io::Result<_>>()?,
    ))
}

fn component_id(value: &Value) -> io::Result<String> {
    object(value)?;
    let name = text(get(value, "name"))?;
    let name = name.trim();
    if name.is_empty() {
        return Err(invalid("dependency component name required"));
    }
    let scope = get(value, "scope");
    let scope_text = if scope.truthy()? { text(scope)? } else { String::new() };
    let scope_trimmed = scope_text.trim();
    let version = get(value, "version");
    let ver_text = if version.truthy()? { text(version)? } else { String::new() };
    let ver_trimmed = ver_text.trim();
    let mut id = String::with_capacity(scope_trimmed.len() + name.len() + ver_trimmed.len() + 2);
    if !scope_trimmed.is_empty() {
        id.push_str(scope_trimmed);
        id.push('/');
    }
    id.push_str(name);
    if !ver_trimmed.is_empty() {
        id.push('@');
        id.push_str(ver_trimmed);
    }
    Ok(id)
}

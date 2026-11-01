#[path = "semantic_extensions.rs"]
mod extensions;

use sha1::{Digest, Sha1};
use std::io;

use super::{choose, get, hexadecimal, invalid, object, text};
use crate::js_json::{Value, stringify};

pub struct Semantic {
    pub bytes: Vec<u8>,
    pub hash: String,
    pub config_assignments: Vec<(usize, Value)>,
}

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
    let mut id =
        if scope_trimmed.is_empty() { name.to_owned() } else { format!("{scope_trimmed}/{name}") };
    let version = get(value, "version");
    if version.truthy()? {
        let ver_text = text(version)?;
        let ver_trimmed = ver_text.trim();
        if !ver_trimmed.is_empty() {
            id.push('@');
            id.push_str(ver_trimmed);
        }
    }
    Ok(id)
}

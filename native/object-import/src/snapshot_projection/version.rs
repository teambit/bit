use std::io;

use super::{choose, get, invalid, object};
use crate::js_json::Value;

const KEYS: &[&str] = &[
    "files",
    "mainFile",
    "bindingPrefix",
    "schema",
    "log",
    "docs",
    "dependencies",
    "devDependencies",
    "flattenedDependencies",
    "flattenedEdges",
    "flattenedEdgesRef",
    "dependenciesGraphRef",
    "extensions",
    "packageDependencies",
    "devPackageDependencies",
    "peerPackageDependencies",
    "overrides",
    "buildStatus",
    "packageJsonChangedProps",
    "parents",
    "squashed",
    "unrelated",
    "bitVersion",
    "modified",
    "origin",
    "hidden",
    "batchId",
];

pub(super) fn project(fields: &Value) -> io::Result<Value> {
    let mut output = Vec::new();
    for &name in KEYS {
        let value = field(fields, name)?;
        if value.truthy()? {
            output.push((name.encode_utf16().collect(), value));
        }
    }
    Ok(Value::Object(output))
}

fn field(fields: &Value, name: &str) -> io::Result<Value> {
    let value = get(fields, name);
    match name {
        "files" => rows(value, &["file", "relativePath", "name", "test"]),
        "log" => {
            object(value)?;
            choose(value, &["message", "date", "username", "email"], false)
        }
        "flattenedEdges" if get(fields, "flattenedEdgesRef").truthy()? => Ok(Value::Undefined),
        "extensions" => extensions(value),
        "squashed" if value.truthy()? => choose(value, &["previousParents", "laneId"], false),
        "unrelated" if value.truthy()? => choose(value, &["head", "laneId"], false),
        _ => Ok(value.clone()),
    }
}

fn rows(value: &Value, names: &[&str]) -> io::Result<Value> {
    if matches!(value, Value::Undefined) {
        return Ok(Value::Undefined);
    }
    let Value::Array(rows) = value else {
        return Err(invalid("snapshot array required"));
    };
    if rows.len() > 65536 {
        return Err(invalid("snapshot array limit"));
    }
    Ok(Value::Array(
        rows.iter()
            .map(|row| {
                object(row)?;
                choose(row, names, false)
            })
            .collect::<io::Result<_>>()?,
    ))
}

fn extensions(value: &Value) -> io::Result<Value> {
    let Value::Array(rows) = value else {
        return Err(invalid("snapshot extensions required"));
    };
    if rows.len() > 65536 {
        return Err(invalid("snapshot extensions limit"));
    }
    let mut output = Vec::new();
    let mut builder_found = false;
    for row in rows {
        object(row)?;
        let builder = !builder_found && is_builder(row);
        builder_found |= builder;
        output.push(extension(row, builder)?);
    }
    Ok(Value::Array(output))
}

fn is_builder(row: &Value) -> bool {
    const BUILDER: &str = "teambit.pipelines/builder";
    for field in ["id", "name", "legacyId", "extensionId"] {
        if let Value::String(units) = get(row, field) {
            let text = String::from_utf16_lossy(units);
            if text.trim().split('@').next() == Some(BUILDER) {
                return true;
            }
        }
    }
    let id = get(row, "extensionId");
    let (Value::String(scope), Value::String(name)) = (get(id, "scope"), get(id, "name")) else {
        return false;
    };
    String::from_utf16_lossy(scope).trim() == "teambit.pipelines"
        && String::from_utf16_lossy(name)
            .trim()
            .split('@')
            .next()
            == Some("builder")
}

fn config(value: &Value) -> Value {
    if matches!(value,Value::String(units) if units.as_slice()==[u16::from(b'-')]) {
        Value::Object(Vec::new())
    } else {
        value.clone()
    }
}

fn extension(row: &Value, builder: bool) -> io::Result<Value> {
    let mut fields = Vec::new();
    for name in ["extensionId", "config", "data", "legacyId", "name"] {
        let value = if name == "config" {
            config(get(row, "rawConfig"))
        } else if name == "data" && builder {
            super::artifacts::convert(get(row, name))?
        } else {
            get(row, name).clone()
        };
        fields.push((name.encode_utf16().collect(), value));
    }
    Ok(Value::Object(fields))
}

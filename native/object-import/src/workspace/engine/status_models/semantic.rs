use super::invalid;
use crate::js_json::Value as Js;
use serde_json::{Map, Value, json};
use std::io;

pub(super) fn hash(model: &Value) -> io::Result<String> {
    Ok(crate::snapshot_projection::semantic(&project(model)?)?.hash)
}

pub(super) fn project(model: &Value) -> io::Result<Js> {
    let mut fields = fields(model)?;
    for field in ["dependencies", "devDependencies"] {
        let value = fields
            .entry(field)
            .or_insert_with(|| json!([]));
        let rows = value.as_array_mut().ok_or_else(|| invalid("status Version dependencies"))?;
        for row in rows {
            row["id"] = identity(&row["id"])?;
        }
    }
    let log = fields
        .get_mut("log")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| invalid("status Version log"))?;
    if log
        .get("message")
        .is_none_or(|value| !value.is_string())
    {
        log.insert("message".into(), json!(""));
    }
    let extensions = model
        .get("extensions")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let extensions = extensions.as_array().ok_or_else(|| invalid("status Version extensions"))?;
    fields.insert(
        "extensions".into(),
        Value::Array(
            extensions
                .iter()
                .map(extension)
                .collect::<io::Result<_>>()?,
        ),
    );
    convert(&Value::Object(fields))
}
fn fields(model: &Value) -> io::Result<Map<String, Value>> {
    let object = model.as_object().ok_or_else(|| invalid("status Version object"))?;
    let mut fields = Map::new();
    for field in [
        "mainFile",
        "files",
        "log",
        "dependencies",
        "devDependencies",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "bindingPrefix",
        "overrides",
    ] {
        if let Some(value) = object.get(field) {
            fields.insert(field.into(), value.clone());
        }
    }
    for field in
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies", "overrides"]
    {
        if fields.get(field).is_none_or(falsy) {
            fields.insert(field.into(), json!({}));
        }
    }
    Ok(fields)
}
fn falsy(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Bool(value) => !value,
        Value::Number(value) => value.as_f64() == Some(0.0),
        Value::String(value) => value.is_empty(),
        Value::Array(_) | Value::Object(_) => false,
    }
}

fn extension(row: &Value) -> io::Result<Value> {
    let mut value = json!({"rawConfig":row.get("config").cloned().unwrap_or_else(|| json!({}))});
    if row
        .get("extensionId")
        .is_some_and(|id| !id.is_null())
    {
        value["extensionId"] = identity(&row["extensionId"])?;
    } else {
        if let Some(name) = row.get("name") {
            value["name"] = name.clone();
        }
        if let Some(id) = row
            .get("id")
            .or_else(|| row.get("legacyId"))
        {
            value["legacyId"] = id.clone();
        }
    }
    Ok(value)
}

fn identity(value: &Value) -> io::Result<Value> {
    if let Some(text) = value.as_str() {
        return identity_from_str(text);
    }
    let object = value.as_object().ok_or_else(|| invalid("status Version dependency identity"))?;
    let Some(raw_name) = object.get("name").and_then(Value::as_str) else {
        return Err(invalid("status Version dependency scope"));
    };
    if object
        .get("scope")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
    {
        return Err(invalid("status Version dependency scope"));
    }
    let mut object = object.clone();
    let (bare_name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver)));
    object.insert("name".into(), json!(bare_name));
    if !object.contains_key("version")
        && let Some(ver) = inline_ver.or_else(|| object.get("head").and_then(Value::as_str))
    {
        object.insert("version".into(), json!(ver));
    }
    if object
        .get("version")
        .and_then(Value::as_str)
        .is_some_and(|version| version.is_empty() || version == "latest")
    {
        object.remove("version");
    }
    Ok(Value::Object(object))
}

fn identity_from_str(text: &str) -> io::Result<Value> {
    let (bare, ver) = text
        .rsplit_once('@')
        .map_or((text, None), |(bare, ver)| (bare, Some(ver)));
    let (scope, name) = bare
        .split_once('/')
        .filter(|(sc, nm)| !sc.is_empty() && !nm.is_empty())
        .ok_or_else(|| invalid("status Version dependency scope"))?;
    let mut out = json!({"scope":scope,"name":name});
    if let Some(ver) = ver.filter(|ver| !ver.is_empty() && *ver != "latest") {
        out["version"] = json!(ver);
    }
    Ok(out)
}
fn convert(value: &Value) -> io::Result<Js> {
    Ok(match value {
        Value::Null => Js::Null,
        Value::Bool(value) => Js::Boolean(*value),
        Value::Number(value) => Js::Number(format!(
            "{:016x}",
            value
                .as_f64()
                .ok_or_else(|| invalid("status number"))?
                .to_bits(),
        )),
        Value::String(value) => Js::text(value),
        Value::Array(values) => Js::Array(
            values
                .iter()
                .map(convert)
                .collect::<io::Result<_>>()?,
        ),
        Value::Object(fields) => Js::Object(
            fields
                .iter()
                .map(|(name, value)| Ok((name.encode_utf16().collect(), convert(value)?)))
                .collect::<io::Result<_>>()?,
        ),
    })
}

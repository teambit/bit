//! Scope-loaded merge components retain Version metadata without workspace load hooks.
use super::{config, invalid, projection};
use serde_json::{Value, json};
use std::io;

pub(super) fn entries(extensions: &Value) -> io::Result<Value> {
    projection::array(extensions)?
        .iter()
        .map(entry)
        .collect::<io::Result<Vec<_>>>()
        .map(Value::Array)
}

fn entry(value: &Value) -> io::Result<Value> {
    let id = identity(value)?;
    let base = id.rsplit_once('@').map_or(id.as_str(), |(base, _)| base);
    let mut config = value
        .get("config")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(config) = config.as_object_mut() {
        config.remove("__specific");
    }
    if !config.is_object() && config != "-" {
        return Err(invalid("scope aspect config"));
    }
    let mut result = json!({"stringId":id,"idWithoutVersion":base,"config":config,
        "isSpecific":value["config"]["__specific"] == true,
        "configJson":serde_json::to_string(&config).map_err(io::Error::other)?,
        "configPretty":serde_json::to_string_pretty(&config).map_err(io::Error::other)?,
        "data":value.get("data").cloned().unwrap_or_else(|| json!({})),"dataUndefinedKeys":[]});
    if let Some(name) = value.get("name") {
        result["name"] = name.clone();
    } else {
        result["componentId"] = json!({"base":base,"legacy":id});
        if let Some((_, version)) = id.rsplit_once('@') {
            result["componentId"]["version"] = json!(version);
        }
    }
    Ok(result)
}

pub(super) fn identity(value: &Value) -> io::Result<String> {
    if let Some(name) = value["name"]
        .as_str()
        .or_else(|| value["legacyId"].as_str())
    {
        return Ok(name.to_owned());
    }
    let id = &value["extensionId"];
    if let Some(id) = id.as_str() {
        return Ok(id
            .strip_suffix("@latest")
            .unwrap_or(id)
            .to_owned());
    }
    let raw_name = id["name"].as_str().ok_or_else(|| invalid("scope aspect name"))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let scope = id["scope"].as_str().unwrap_or_default();
    let base = if scope.is_empty() {
        if !name.contains('/') {
            return Err(invalid("scope aspect scope"));
        }
        name.to_owned()
    } else {
        format!("{scope}/{name}")
    };
    let version = id["version"]
        .as_str()
        .filter(|version| !version.is_empty())
        .or(inline_ver)
        .filter(|version| *version != "latest");
    Ok(version.map_or_else(|| base.clone(), |version| format!("{base}@{version}")))
}

pub(super) fn apply(
    extensions: &Value,
    merged: &Value,
    versions: &[Value; 3],
) -> io::Result<Value> {
    let original = projection::array(extensions)?;
    let merged = config::normalized(merged)?;
    let configs = merged.as_object().ok_or_else(|| invalid("scope merged configuration"))?;
    let mut output = Vec::new();
    for (id, config) in configs {
        if config == "-" {
            continue;
        }
        let incoming = projection::array(&versions[2]["extensions"])?;
        let candidates = || original.iter().chain(incoming.iter());
        let mut selected = candidates()
            .find(|entry| identity(entry).is_ok_and(|identity| identity == *id))
            .or_else(|| candidates().find(|entry| same_base(entry, id)))
            .cloned()
            .ok_or_else(|| invalid("scope merged aspect identity"))?;
        selected["config"] = config.clone();
        output.push(selected);
    }
    for value in original {
        if !configs.keys().any(|id| same_base(value, id)) {
            output.push(value.clone());
        }
    }
    Ok(Value::Array(output))
}

fn same_base(entry: &Value, id: &str) -> bool {
    identity(entry)
        .is_ok_and(|identity| {
            identity.split_once('@').map_or(identity.as_str(), |(base, _)| base)
                == id.split_once('@').map_or(id, |(base, _)| base)
        })
}

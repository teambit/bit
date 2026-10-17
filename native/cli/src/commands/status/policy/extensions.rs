//! `statusExtensions(version, target)`: the core aspects configured on the
//! stored version, with bitmap configuration applied, for components that
//! only use the built-in Node environment.

use super::super::js::{array, decline, nullish, object};
use serde_json::{Map, Value, json};
use std::io;

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const DEPRECATION: &str = "teambit.component/deprecation";
const REMOVAL: &str = "teambit.component/remove";
const CORES: [&str; 13] = [
    "teambit.envs/envs",
    RESOLVER,
    "teambit.component/dev-files",
    "teambit.semantics/schema",
    "teambit.pkg/pkg",
    "teambit.preview/preview",
    "teambit.compositions/compositions",
    "teambit.docs/docs",
    DEPRECATION,
    "teambit.component/internalize",
    "teambit.component/issues",
    REMOVAL,
    "teambit.pipelines/builder",
];

/// Core/custom aspect configurations after the shared native origin merge.
pub fn status_extensions(target: &Value) -> io::Result<Vec<Value>> {
    array(target.get("projectedExtensions"), "projected extensions")?
        .iter()
        .map(projected_extension)
        .collect()
}

fn projected_extension(extension: &Value) -> io::Result<Value> {
    if extension.get("extensionId").is_some() {
        return Ok(extension.clone());
    }
    let name =
        extension["name"].as_str().ok_or_else(|| decline("status projected extension name"))?;
    model_extension(extension, name)
}

fn model_extension(extension: &Value, name: &str) -> io::Result<Value> {
    if !CORES.contains(&name)
        && !bit_install::workspace::CORE_ENVS.contains(&name)
        && !core_aspect(name)
    {
        return Err(decline("status configured model extension"));
    }
    let stored_config = nullish(extension.get("config"));
    let mut config = match stored_config {
        None => Map::new(),
        Some(config) => object(config)?.clone(),
    };
    config.remove("__specific");
    validate_config(name, &config)?;
    let config = stored_config
        .cloned()
        .unwrap_or_else(|| json!({}));
    Ok(json!({ "name": name, "config": config }))
}

fn validate_config(name: &str, config: &Map<String, Value>) -> io::Result<()> {
    let valid = match name {
        DEPRECATION => config.iter().all(|(key, value)| deprecation_field(key, value)),
        REMOVAL => return validate_removal_config(config),
        _ => true,
    };
    if valid { Ok(()) } else { Err(decline("status unsupported core extension configuration")) }
}

fn deprecation_field(key: &str, value: &Value) -> bool {
    match key {
        "deprecate" => value.is_boolean(),
        "range" => value.is_string() || value.is_null(),
        "newId" => replacement_id(value),
        _ => false,
    }
}

fn replacement_id(value: &Value) -> bool {
    if value.is_null() || value == "" {
        return true;
    }
    value
        .as_object()
        .is_some_and(|id| {
            id.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| !name.is_empty())
                && id
                    .iter()
                    .all(|(key, value)| {
                        matches!(key.as_str(), "scope" | "name" | "version") && value.is_string()
                    })
        })
}

fn validate_removal_config(config: &Map<String, Value>) -> io::Result<()> {
    if config.get("removed") != Some(&Value::Bool(true))
        || config
            .iter()
            .any(|(key, value)| {
                !matches!(key.as_str(), "removed" | "removeOnMain") || !value.is_boolean()
            })
    {
        return Err(decline("status unsupported removal configuration"));
    }
    Ok(())
}

fn core_aspect(name: &str) -> bool {
    include_str!("../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json")
        .split('"')
        .any(|id| id == name)
}

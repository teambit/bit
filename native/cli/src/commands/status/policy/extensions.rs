//! `statusExtensions(version, target)`: the core aspects configured on the
//! stored version, with bitmap configuration applied, for components that
//! only use the built-in Node environment.
//!
//! Merges [`CORES`], [`RESOLVER`], [`DEPRECATION`], [`REMOVAL`], stored version, and `.bitmap` extension entries into JSON [`Value`] arrays.

#[cfg(test)]
mod tests;

use super::super::js::{array, decline, nullish, object};
use serde_json::{Map, Value, json};
use std::io;

/// Aspect ID for the dependency resolver (`teambit.dependencies/dependency-resolver`).
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
/// Aspect ID for the deprecation extension (`teambit.component/deprecation`).
const DEPRECATION: &str = "teambit.component/deprecation";
/// Aspect ID for the removal extension (`teambit.component/remove`).
const REMOVAL: &str = "teambit.component/remove";
/// Built-in core aspect IDs accepted by `statusExtensions` without custom host hydration.
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

/// Core/custom aspect configurations after the shared native origin merge ([`projected_extension`]).
#[inline]
pub fn status_extensions(target: &Value) -> io::Result<Vec<Value>> {
    array(target.get("projectedExtensions"), "projected extensions")?
        .iter()
        .map(projected_extension)
        .collect()
}

/// Normalizes a projected extension [`Value`] or validates a bare model extension via [`model_extension`].
#[inline]
fn projected_extension(extension: &Value) -> io::Result<Value> {
    if nullish(extension.get("extensionId")).is_some()
        || nullish(extension.get("legacyId")).is_some()
        || nullish(extension.get("id")).is_some()
    {
        return Ok(extension.clone());
    }
    let name = extension["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| decline("status projected extension name"))?;
    model_extension(extension, name)
}

/// Validates and normalizes a bare model `extension` [`Value`] with aspect `name`.
fn model_extension(extension: &Value, name: &str) -> io::Result<Value> {
    let bare = bit_install::config::aspect_id_without_version(name);
    if !CORES.contains(&bare)
        && !bit_install::workspace::CORE_ENVS.contains(&bare)
        && !core_aspect(bare)
    {
        return Err(decline("status configured model extension"));
    }
    let config = match nullish(extension.get("config")) {
        None => json!({}),
        Some(config) => {
            validate_config(bare, object(config)?)?;
            config.clone()
        }
    };
    Ok(json!({ "name": bare, "config": config }))
}

/// Validates `config` fields when `name` is [`DEPRECATION`] or [`REMOVAL`].
#[inline]
fn validate_config(name: &str, config: &Map<String, Value>) -> io::Result<()> {
    let valid = match name {
        DEPRECATION => config.iter().all(|(key, value)| deprecation_field(key, value)),
        REMOVAL => return validate_removal_config(config),
        _ => true,
    };
    if valid { Ok(()) } else { Err(decline("status unsupported core extension configuration")) }
}

#[inline]
fn deprecation_field(key: &str, value: &Value) -> bool {
    match key {
        "__specific" => true,
        "deprecate" => value.is_boolean(),
        "range" => value.is_string() || value.is_null(),
        "newId" => replacement_id(value),
        _ => false,
    }
}

fn replacement_id(value: &Value) -> bool {
    if value.is_null()
        || value
            .as_str()
            .is_some_and(|text| text.trim().is_empty())
    {
        return true;
    }
    value
        .as_object()
        .is_some_and(|id| {
            id.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| !name.trim().is_empty())
                && id
                    .iter()
                    .all(|(key, value)| {
                        matches!(key.as_str(), "scope" | "name" | "version") && value.is_string()
                    })
        })
}

fn validate_removal_config(config: &Map<String, Value>) -> io::Result<()> {
    if !config
        .iter()
        .all(|(key, value)| match key.as_str() {
            "__specific" => true,
            "removed" | "removeOnMain" => value.is_boolean(),
            "range" => value
                .as_str()
                .is_some_and(|range| node_semver::Range::parse(range.trim()).is_ok()),
            "snaps" => valid_snap_list(value),
            _ => false,
        })
    {
        return Err(decline("status unsupported removal configuration"));
    }
    Ok(())
}

#[inline]
fn valid_snap_list(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|snaps| {
            snaps
                .iter()
                .all(|snap| {
                    snap.as_str()
                        .is_some_and(|hash| !hash.trim().is_empty())
                })
        })
}

#[inline]
fn core_aspect(name: &str) -> bool {
    include_str!("../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json")
        .split('"')
        .any(|id| id == name)
}

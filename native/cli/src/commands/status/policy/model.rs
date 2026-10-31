//! Stored Version selection and Harmony dependency validation for status metadata.

use crate::commands::status::js::{array, decline, nullish, truthy};
use serde_json::Value;
use std::io;

pub(in crate::commands::status) fn model_of<'c>(
    context: &'c Value,
    identity: &str,
) -> Option<&'c Value> {
    let models = context.get("models").and_then(Value::as_array)?;
    let (_, target_name) = identity
        .split_once('/')
        .unwrap_or(("", identity));
    models
        .iter()
        .find(|model| {
            let scope = model
                .get("scope")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            format!("{scope}/{name}") == identity || (scope.is_empty() && name == target_name)
        })
}

/// The stored `Version` object the target's bitmap version refers to.
pub(super) fn stored_version<'c>(
    context: &'c Value,
    target: &Value,
    model: Option<&'c Value>,
    projected: Option<&'c Value>,
) -> io::Result<Option<&'c Value>> {
    let tagged = target
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    match (tagged, model) {
        (Some(_), None) => return Err(decline("status pending import")),
        (None, Some(_)) => return Err(decline("status bitmap normalization required")),
        (None, None) => return Ok(projected),
        (Some(_), Some(model)) => validate_unscoped_model(target, model)?,
    }
    if projected.is_some() {
        return Ok(projected);
    }
    let tag = tagged.unwrap_or_default();
    let reference = if matches!(tag, "latest" | "head") {
        model
            .and_then(|model_val| nullish(model_val.get("head")))
            .cloned()
    } else if is_hash(tag) {
        Some(Value::String(tag.to_string()))
    } else {
        let lookup = |field: &str| {
            nullish(
                model
                    .and_then(|model_val| model_val.get(field))
                    .and_then(|versions_val| versions_val.get(tag)),
            )
        };
        lookup("orphanedVersions").or_else(|| lookup("versions")).cloned()
    };
    let versions = array(context.get("versions"), "versions")?;
    let version = versions
        .iter()
        .find(|row| {
            reference
                .as_ref()
                .is_some_and(|reference| row.get(0) == Some(reference))
        })
        .and_then(|row| nullish(row.get(1)));
    version.map(Some).ok_or_else(|| decline("status version absent"))
}

fn validate_unscoped_model(target: &Value, model: &Value) -> io::Result<()> {
    if !cfg!(windows)
        && target["scoped"] != true
        && (model["head"].is_string()
            || model["versions"]
                .as_object()
                .is_some_and(|versions| !versions.is_empty())
            || model["orphanedVersions"]
                .as_object()
                .is_some_and(|versions| !versions.is_empty()))
        && !model["state"]["versions"]
            .as_object()
            .is_some_and(|versions| {
                versions
                    .values()
                    .any(|entry| entry["local"] == true)
            })
    {
        return Err(decline("status bitmap normalization required"));
    }
    Ok(())
}

fn is_hash(text: &str) -> bool {
    text.len() == 40 && text.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `validateHarmonyVersion`.
pub(super) fn validate_harmony_version(version: Option<&Value>) -> io::Result<()> {
    let Some(version) = version else { return Ok(()) };
    if !matches!(version.get("schema").and_then(Value::as_str), Some("1.0.0" | "2.0.0")) {
        return Err(decline("status legacy component"));
    }
    for dependency in dependencies(Some(version))? {
        if !is_valid_harmony_dep_id(dependency) {
            return Err(decline("status unscoped dependency"));
        }
        if let Some(paths) = nullish(dependency.get("relativePaths"))
            && paths
                .as_array()
                .is_none_or(|paths| !paths.is_empty())
        {
            return Err(decline("status relative dependency paths"));
        }
    }
    Ok(())
}

fn is_valid_harmony_dep_id(dependency: &Value) -> bool {
    let id = dependency.get("id").unwrap_or(dependency);
    if let Some(raw) = id.as_str() {
        return raw
            .split_once('/')
            .is_some_and(|(scope, rest)| !scope.is_empty() && !rest.is_empty());
    }
    let part = |key| {
        id.get(key)
            .or_else(|| dependency.get(key))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
    };
    truthy(Some(id)) && part("scope").is_some() && part("name").is_some()
}

/// `[...(version?.dependencies ?? []), ...(version?.devDependencies ?? [])]`.
pub(super) fn dependencies(version: Option<&Value>) -> io::Result<Vec<&Value>> {
    let field = |name| array(version.and_then(|stored| stored.get(name)), name);
    Ok(field("dependencies")?
        .iter()
        .chain(field("devDependencies")?)
        .collect())
}

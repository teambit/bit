//! Stored `Version` selection and Harmony dependency validation for status metadata.
//!
//! [`model_of`] and [`stored_version`] locate the stored component [`Value`] model and version for a workspace identity.

use crate::commands::status::js::{array, decline, nullish, truthy};
use serde_json::Value;
use std::io;

/// Finds the stored model [`Value`] in `context["models"]` matching `identity` (used by [`stored_version`]).
pub(in crate::commands::status) fn model_of<'c>(
    context: &'c Value,
    identity: &str,
) -> Option<&'c Value> {
    let models = context.get("models").and_then(Value::as_array)?;
    let bare_id = crate::commands::status::js::without_version(identity);
    let (target_scope, target_name) = bare_id
        .split_once('/')
        .map_or(("", bare_id), |(scope, name)| (scope.trim(), name.trim()));
    if target_name.is_empty() {
        return None;
    }
    models
        .iter()
        .find(|model| {
            let scope = model
                .get("scope")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default();
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default();
            name == target_name && (scope == target_scope || scope.is_empty())
        })
}

/// The stored `Version` [`Value`] object that `target`'s `.bitmap` version refers to ([`resolve_tag_reference`]).
pub(super) fn stored_version<'c>(
    context: &'c Value,
    target: &Value,
    model: Option<&'c Value>,
    projected: Option<&'c Value>,
) -> io::Result<Option<&'c Value>> {
    let tagged = target
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
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
    let versions = array(context.get("versions"), "versions")?;
    let Some(expected) = resolve_tag_reference(model, tagged.unwrap_or_default()) else {
        return Err(decline("status version absent"));
    };
    let ref_str = expected.as_str().map(str::trim);
    let version = versions
        .iter()
        .find(|row| {
            row.get(0) == Some(&expected)
                || (ref_str.is_some()
                    && row
                        .get(0)
                        .and_then(Value::as_str)
                        .map(str::trim)
                        == ref_str)
        })
        .and_then(|row| nullish(row.get(1)));
    version.map(Some).ok_or_else(|| decline("status version absent"))
}

/// Resolves a version `tag` (`"latest"`, `"head"`, 40-char hash, or semver tag) against `model` ([`Value`]).
fn resolve_tag_reference(model: Option<&Value>, tag: &str) -> Option<Value> {
    let tag = tag.trim();
    if matches!(tag, "latest" | "head") {
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
    }
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

#[inline]
fn is_hash(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.len() == 40 && trimmed.bytes().all(|byte| byte.is_ascii_hexdigit())
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

#[inline]
fn is_valid_harmony_dep_id(dependency: &Value) -> bool {
    let id = dependency.get("id").unwrap_or(dependency);
    if let Some(raw) = id.as_str() {
        return raw
            .trim()
            .split_once('/')
            .is_some_and(|(scope, rest)| !scope.trim().is_empty() && !rest.trim().is_empty());
    }
    truthy(Some(id))
        && non_empty_part(id, dependency, "scope").is_some()
        && non_empty_part(id, dependency, "name").is_some()
}

#[inline]
fn non_empty_part<'a>(id: &'a Value, dependency: &'a Value, key: &str) -> Option<&'a str> {
    id.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            dependency
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
}

/// `[...(version?.dependencies ?? []), ...(version?.devDependencies ?? [])]`.
#[inline]
pub(super) fn dependencies(version: Option<&Value>) -> io::Result<Vec<&Value>> {
    let field = |name| array(version.and_then(|stored| stored.get(name)), name);
    Ok(field("dependencies")?
        .iter()
        .chain(field("devDependencies")?)
        .collect())
}

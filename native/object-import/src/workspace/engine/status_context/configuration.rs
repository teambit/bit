//! `load-bit.mergeConfigs`: global aspect settings, overridden by workspace settings via [`effective`].

use super::config;
use serde_json::Value;
use std::{io, path::Path};

/// Aspect identifier for the workspace dependency resolver configuration entry.
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

/// Effective aspect settings using the released global and workspace precedence via [`effective_value`].
#[inline]
pub fn effective(root: &Path, home: &Path) -> io::Result<Value> {
    let workspace = config::document(&root.join("workspace.jsonc"))?;
    effective_value(workspace, home)
}
/// Looks up an aspect configuration entry by exact or versioned `id` in `doc` ([`Value`]) via [`find_versioned_aspect`].
#[inline]
fn aspect_value<'a>(doc: &'a Value, id: &str) -> Option<&'a Value> {
    let id = id.trim();
    let map = doc.as_object()?;
    map.get(id)
        .or_else(|| {
            map.iter()
                .find_map(|(key, val)| (key.trim() == id).then_some(val))
        })
        .or_else(|| find_versioned_aspect(map, id))
}

/// Finds an aspect entry in `map` whose key matches `{id}@<non-empty-version>`.
#[inline]
fn find_versioned_aspect<'a>(
    map: &'a serde_json::Map<String, Value>,
    id: &str,
) -> Option<&'a Value> {
    let prefix = format!("{id}@");
    map.iter()
        .find_map(|(key, val)| {
            key.trim()
                .strip_prefix(&prefix)
                .is_some_and(|version| !version.trim().is_empty())
                .then_some(val)
        })
}

/// Apply global aspect settings to an already retained workspace document.
/// Shallow-merges [`RESOLVER`] settings when `~/.bitrc.jsonc` exists.
pub(crate) fn effective_value(workspace: Value, home: &Path) -> io::Result<Value> {
    if !workspace.is_object() {
        return Err(super::invalid("workspace aspect configuration"));
    }
    let path = home.join(".bitrc.jsonc");
    if !path.try_exists()? {
        return Ok(workspace);
    }
    let mut global = config::document(&path)?;
    let resolver = merge(aspect_value(&global, RESOLVER), aspect_value(&workspace, RESOLVER))?;
    let Value::Object(workspace_map) = workspace else {
        return Err(super::invalid("workspace aspect configuration"));
    };
    let combined =
        global.as_object_mut().ok_or_else(|| super::invalid("global aspect configuration"))?;
    combined.extend(workspace_map);
    combined.insert(RESOLVER.to_owned(), resolver);
    Ok(global)
}

/// Shallow-merges `base` and `override_value` JSON objects for dependency-resolver settings.
#[inline]
fn merge(base: Option<&Value>, override_value: Option<&Value>) -> io::Result<Value> {
    let mut result = serde_json::Map::new();
    for value in [base, override_value]
        .into_iter()
        .flatten()
        .filter(|value| !value.is_null())
    {
        result.extend(
            value
                .as_object()
                .ok_or_else(|| super::invalid("dependency resolver configuration"))?
                .clone(),
        );
    }
    Ok(Value::Object(result))
}

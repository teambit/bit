//! `load-bit.mergeConfigs`: global aspect settings, overridden by workspace settings.

use super::config;
use serde_json::Value;
use std::{io, path::Path};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

/// Effective aspect settings using the released global/workspace precedence.
pub fn effective(root: &Path, home: &Path) -> io::Result<Value> {
    let workspace = config::document(&root.join("workspace.jsonc"))?;
    effective_value(workspace, home)
}

fn aspect_value<'a>(doc: &'a Value, id: &str) -> Option<&'a Value> {
    let map = doc.as_object()?;
    map.get(id)
        .or_else(|| {
            map.iter()
                .find_map(|(key, val)| (key.trim() == id).then_some(val))
        })
        .or_else(|| find_versioned_aspect(map, id))
}

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
pub(crate) fn effective_value(workspace: Value, home: &Path) -> io::Result<Value> {
    let path = home.join(".bitrc.jsonc");
    if !path.try_exists()? {
        return Ok(workspace);
    }
    let mut global = config::document(&path)?;
    let resolver = merge(aspect_value(&global, RESOLVER), aspect_value(&workspace, RESOLVER))?;
    let combined =
        global.as_object_mut().ok_or_else(|| super::invalid("global aspect configuration"))?;
    combined.extend(
        workspace
            .as_object()
            .ok_or_else(|| super::invalid("workspace aspect configuration"))?
            .clone(),
    );
    combined.insert(RESOLVER.to_owned(), resolver);
    Ok(global)
}

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

//! `load-bit.mergeConfigs`: global aspect settings, overridden by workspace settings.

use super::config;
use serde_json::Value;
use std::{io, path::Path};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

/// Effective aspect settings using the released global/workspace precedence.
pub fn effective(root: &Path, home: &Path) -> io::Result<Value> {
    let workspace = config::document(&root.join("workspace.jsonc"))?;
    let path = home.join(".bitrc.jsonc");
    if !path.try_exists()? {
        return Ok(workspace);
    }
    let mut global = config::document(&path)?;
    let resolver = merge(global.get(RESOLVER), workspace.get(RESOLVER))?;
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

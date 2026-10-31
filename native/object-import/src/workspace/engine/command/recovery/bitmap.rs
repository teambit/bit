#[cfg(test)]
mod tests;

use super::super::invalid;
use serde_json::Value;
use std::{collections::HashMap, io};

pub(in crate::workspace::engine::command) fn project(
    bitmap: &Value,
) -> io::Result<(Value, HashMap<String, Value>)> {
    project_with(bitmap, validate)
}

pub(in crate::workspace::engine::command) fn project_snapshot(
    bitmap: &Value,
) -> io::Result<(Value, HashMap<String, Value>)> {
    project_with(bitmap, validate_snapshot)
}

fn validate_snapshot(config: &Value) -> io::Result<()> {
    let rows = config.as_object().ok_or_else(|| invalid("snapshot bitmap configuration"))?;
    if rows
        .iter()
        .any(|(name, value)| {
            name.trim()
                .split_once('/')
                .is_none_or(|(scope, part)| scope.trim().is_empty() || part.trim().is_empty())
                || (!value.is_object() && value != "-")
        })
    {
        return Err(invalid("snapshot bitmap aspect configuration"));
    }
    Ok(())
}

fn project_with(
    bitmap: &Value,
    validate: fn(&Value) -> io::Result<()>,
) -> io::Result<(Value, HashMap<String, Value>)> {
    let mut projected = bitmap.clone();
    let mut configs = HashMap::new();
    for (key, row) in projected.as_object_mut().ok_or_else(|| invalid("recovery bitmap"))? {
        if key.starts_with('$') || matches!(key.as_str(), "_bit_lane" | "version") {
            continue;
        }
        let object = row.as_object_mut().ok_or_else(|| invalid("recovery bitmap component"))?;
        let Some(config) = object.remove("config") else {
            continue;
        };
        validate(&config)?;
        let directory = object
            .get("rootDir")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|directory| !directory.is_empty())
            .ok_or_else(|| invalid("recovery bitmap directory"))?;
        if configs.insert(directory.to_owned(), config).is_some() {
            return Err(invalid("recovery duplicate config root"));
        }
    }
    Ok((projected, configs))
}
fn validate(config: &Value) -> io::Result<()> {
    let rows = config.as_object().ok_or_else(|| invalid("recovery bitmap configuration"))?;
    for (name, value) in rows {
        let bare = match name.split_once('@') {
            Some((prefix, _)) if !prefix.is_empty() => prefix,
            _ => name.as_str(),
        };
        if !matches!(
            bare,
            "teambit.dependencies/dependency-resolver"
                | "teambit.envs/envs"
                | "teambit.component/dev-files"
                | "teambit.semantics/schema"
                | "teambit.pkg/pkg"
                | "teambit.preview/preview"
                | "teambit.compositions/compositions"
                | "teambit.docs/docs"
                | "teambit.pipelines/builder"
                | "teambit.component/deprecation",
        ) {
            return Err(invalid("recovery bitmap custom configuration"));
        }
        let Some(object) = value.as_object() else {
            return Err(invalid("recovery bitmap custom configuration"));
        };
        // Effective policy is consumed by the recovery status adapter. Nonempty
        // custom provider configuration remains outside this command boundary.
        if object
            .keys()
            .any(|key| bare != "teambit.dependencies/dependency-resolver" || key != "policy")
        {
            return Err(invalid("recovery bitmap provider configuration"));
        }
    }
    Ok(())
}

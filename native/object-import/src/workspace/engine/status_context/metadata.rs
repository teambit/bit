use super::invalid;
use crate::read_budget::Budget;
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn optional(path: &Path, budget: &Budget) -> io::Result<Value> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(invalid("status context nonordinary or oversized metadata"));
    }
    let bytes = budget.read(fs::File::open(path)?)?;
    let value: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    if !value.is_object() {
        return Err(invalid("status context metadata object"));
    }
    Ok(value)
}

pub(super) fn component(
    root: &Path,
    mut target: Value,
    budget: &Budget,
    recovery: bool,
) -> io::Result<Value> {
    let directory =
        target["directory"].as_str().ok_or_else(|| invalid("status context directory"))?;
    let path = root.join(directory);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if !metadata.is_dir() => {
            return Err(invalid("status context component directory"));
        }
        Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    let component = optional(&path.join("component.json"), budget)?;
    configuration(&component, recovery)?;
    if !component.is_null()
        && format!(
            "{}/{}",
            component["componentId"]["scope"].as_str().unwrap_or_default(),
            component["componentId"]["name"].as_str().unwrap_or_default(),
        ) != target["identity"].as_str().unwrap_or_default()
    {
        return Err(invalid("status context component config identity"));
    }
    target["config"] = component;
    target["packageJson"] = optional(&path.join("package.json"), budget)?;
    Ok(target)
}

fn configuration(config: &Value, recovery: bool) -> io::Result<()> {
    let Some(object) = config.as_object() else {
        return Ok(());
    };
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "componentId" | "extensions" | "propagate" | "$schema"))
        || config
            .get("propagate")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("status context component configuration"));
    }
    let Some(extensions) = config.get("extensions") else {
        return Err(invalid("status context missing extensions"));
    };
    let extensions = extensions.as_object().ok_or_else(|| invalid("status context extensions"))?;
    for (name, value) in extensions {
        extension_configuration(name, value, recovery)?;
    }
    Ok(())
}
fn extension_configuration(name: &str, value: &Value, recovery: bool) -> io::Result<()> {
    if recovery && empty_core(name, value) {
        return Ok(());
    }
    if name != "teambit.dependencies/dependency-resolver" {
        return Err(invalid("status context extension requires Harmony"));
    }
    let fields = value.as_object().ok_or_else(|| invalid("status context resolver"))?;
    if fields.keys().any(|key| key != "policy") {
        return Err(invalid("status context resolver requires Harmony"));
    }
    Ok(())
}

fn empty_core(name: &str, value: &Value) -> bool {
    matches!(
        name,
        "teambit.envs/envs"
            | "teambit.component/dev-files"
            | "teambit.semantics/schema"
            | "teambit.pkg/pkg"
            | "teambit.preview/preview"
            | "teambit.compositions/compositions"
            | "teambit.docs/docs"
            | "teambit.pipelines/builder"
            | "teambit.component/deprecation",
    ) && value.as_object().is_some_and(serde_json::Map::is_empty)
}

pub(super) fn scope(scope: &Value) -> io::Result<()> {
    let fields = scope.as_object().ok_or_else(|| invalid("status context scope"))?;
    if fields
        .keys()
        .any(|key| !matches!(key.as_str(), "name" | "version" | "remotes" | "lanes" | "groupName"))
        || scope["name"].as_str().is_none_or(str::is_empty)
    {
        return Err(invalid("status context scope configuration requires canonical lifecycle"));
    }
    Ok(())
}
#[cfg(test)]
mod tests;

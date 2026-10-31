#[cfg(test)]
mod tests;

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
    let directory = target["directory"]
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .ok_or_else(|| invalid("status context directory"))?;
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
        && !component_id_matches(
            &component,
            target["identity"]
                .as_str()
                .map(str::trim)
                .unwrap_or_default(),
        )
    {
        return Err(invalid("status context component config identity"));
    }
    target["config"] = component;
    target["packageJson"] = optional(&path.join("package.json"), budget)?;
    Ok(target)
}

fn component_id_matches(component: &Value, target_identity: &str) -> bool {
    let id = &component["componentId"];
    if let Some(id_str) = id.as_str() {
        let bare = id_str
            .trim()
            .split('@')
            .next()
            .unwrap_or(id_str)
            .trim();
        return bare == target_identity;
    }
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .unwrap_or_default();
    let scope = id["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            id["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
        .unwrap_or_default();
    format!("{scope}/{name}") == target_identity
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
    let Some(extensions) = config
        .get("extensions")
        .filter(|val| !val.is_null())
    else {
        return Ok(());
    };
    let extensions = extensions.as_object().ok_or_else(|| invalid("status context extensions"))?;
    for (name, value) in extensions {
        extension_configuration(name, value, recovery)?;
    }
    Ok(())
}
fn bare_aspect_id(name: &str) -> &str {
    let name = name.trim();
    match name.split_once('@') {
        Some((bare, _)) if !bare.trim().is_empty() => bare.trim(),
        _ => name,
    }
}
fn extension_configuration(name: &str, value: &Value, recovery: bool) -> io::Result<()> {
    let bare = bare_aspect_id(name);
    if recovery && empty_core(bare, value) {
        return Ok(());
    }
    if bare == "teambit.envs/envs" {
        let config =
            value.as_object().ok_or_else(|| invalid("status environment configuration"))?;
        if config
            .get("env")
            .is_some_and(|env| {
                env.as_str()
                    .map(str::trim)
                    .is_none_or(str::is_empty)
            })
        {
            return Err(invalid("status environment identifier"));
        }
        return Ok(());
    }
    if value.as_object().is_some_and(serde_json::Map::is_empty) && bare.contains('/') {
        return Ok(());
    }
    if bare == "teambit.component/issues" {
        return issue_configuration(value);
    }
    value.as_object().ok_or_else(|| invalid("status context aspect configuration"))?;
    Ok(())
}

fn issue_configuration(value: &Value) -> io::Result<()> {
    let fields = value.as_object().ok_or_else(|| invalid("status issue configuration"))?;
    let names = value
        .get("ignoreIssues")
        .is_none_or(|value| {
            value
                .as_array()
                .is_some_and(|names| names.len() <= 256 && names.iter().all(valid_issue_name))
        });
    if fields
        .keys()
        .all(|key| key == "ignoreIssues")
        && names
    {
        Ok(())
    } else {
        Err(invalid("status issue configuration"))
    }
}

fn valid_issue_name(entry: &Value) -> bool {
    entry
        .as_str()
        .map(str::trim)
        .is_some_and(|name| !name.is_empty() && !name.chars().any(char::is_control))
}

fn empty_core(name: &str, value: &Value) -> bool {
    matches!(
        bare_aspect_id(name),
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
    scope.as_object().ok_or_else(|| invalid("status context scope"))?;
    if scope["name"]
        .as_str()
        .is_none_or(|name| name.trim().is_empty())
    {
        return Err(invalid("status context scope configuration requires canonical lifecycle"));
    }
    Ok(())
}

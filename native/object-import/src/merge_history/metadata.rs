// Conservative eligibility covers parseable Version records; unsupported model constructors replay in Node.
use super::{count, hash, invalid};
use serde_json::Value;
use std::io;
pub(crate) fn validate(value: &Value) -> io::Result<()> {
    if !value
        .get("mainFile")
        .is_some_and(|value| {
            value
                .as_str()
                .is_some_and(|text| !text.trim().is_empty())
        })
        || !value.get("log").is_some_and(Value::is_object)
    {
        return Err(invalid("history invalid Version required metadata"));
    }
    let files = value
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("history missing Version files"))?;
    count(files.len())?;
    for file in files {
        if !file.is_object() {
            return Err(invalid("history invalid Version file"));
        }
        hash(
            file.get("file")
                .and_then(Value::as_str)
                .ok_or_else(|| invalid("history missing Source ref"))?,
        )?;
    }
    for field in
        ["dependencies", "devDependencies", "flattenedDependencies", "flattenedDevDependencies"]
    {
        empty_array(value, field)?;
    }
    if !value.get("flattenedEdgesRef").is_some_and(truthy) {
        empty_array(value, "flattenedEdges")?;
    }
    references(value)?;
    extensions(value)?;
    lane(value, "unrelated")?;
    lane(value, "squashed")
}
fn truthy(value: &Value) -> bool {
    !value.is_null() && value != &Value::Bool(false) && value.as_str() != Some("")
}
fn empty_array(value: &Value, field: &str) -> io::Result<()> {
    match value.get(field) {
        None => Ok(()),
        Some(Value::Array(items)) if items.is_empty() => Ok(()),
        _ => Err(invalid("history unsupported dependency metadata")),
    }
}
fn extensions(value: &Value) -> io::Result<()> {
    let Some(extensions) = value.get("extensions") else {
        return Ok(());
    };
    let extensions = extensions.as_array().ok_or_else(|| invalid("history invalid extensions"))?;
    count(extensions.len())?;
    for extension in extensions {
        if !extension.is_object() || extension.get("extensionId").is_some_and(truthy) {
            return Err(invalid("history unsupported extension identity"));
        }
        if is_builder_with_artifacts(extension) {
            return Err(invalid("history unsupported builder artifact constructors"));
        }
    }
    Ok(())
}
fn is_builder_with_artifacts(extension: &Value) -> bool {
    let is_builder = crate::workspace::engine::client_status::config::is_extension_aspect(
        extension,
        "teambit.pipelines/builder",
    ) || extension["id"]
        .as_str()
        .map(str::trim)
        .is_some_and(|id| {
            id == "teambit.pipelines/builder" || id.starts_with("teambit.pipelines/builder@")
        });
    is_builder
        && extension
            .get("data")
            .and_then(|data| data.get("artifacts"))
            .is_some_and(|artifacts| {
                truthy(artifacts) && !artifacts.as_array().is_some_and(Vec::is_empty)
            })
}
fn lane(value: &Value, field: &str) -> io::Result<()> {
    let Some(item) = value.get(field).filter(|value| truthy(value)) else {
        return Ok(());
    };
    let lane = item
        .get("laneId")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("history invalid lane metadata"))?;
    if lane
        .get("name")
        .and_then(Value::as_str)
        .is_none_or(|name| name.trim().is_empty())
        || !lane.get("scope").is_some_and(Value::is_string)
    {
        return Err(invalid("history unsupported lane identity"));
    }
    if field == "unrelated" {
        hash(
            item.get("head")
                .and_then(Value::as_str)
                .ok_or_else(|| invalid("history missing unrelated ref"))?,
        )?;
    } else {
        let parents = item
            .get("previousParents")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("history invalid squashed refs"))?;
        count(parents.len())?;
        for parent in parents {
            hash(parent.as_str().ok_or_else(|| invalid("history invalid squashed ref"))?)?;
        }
    }
    Ok(())
}

fn references(value: &Value) -> io::Result<()> {
    for field in ["flattenedDependenciesRef", "flattenedEdgesRef", "dependenciesGraphRef"] {
        if let Some(reference) = value.get(field).filter(|value| truthy(value)) {
            hash(reference.as_str().ok_or_else(|| invalid("history invalid graph ref"))?)?;
        }
    }
    Ok(())
}

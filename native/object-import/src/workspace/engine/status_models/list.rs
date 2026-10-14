//! `scopeList`: what `ComponentsList.listAll` reads of each model in the
//! scope index, `isDeprecated` and `isLaneReadmeOf` from its head Version.
//! A head Version missing locally is reported as unknown, as Node does.

use super::{Reader, index, invalid};
use crate::read_budget::Budget;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    let items = index::read(&request.root)?;
    let directory = request.root.join(".bit/objects");
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(256 * 1024 * 1024),
        packed: Budget::new(256 * 1024 * 1024),
    };
    let rows = pool.install(|| {
        items
            .par_iter()
            .map(|item| row(&reader, &index::model(&reader, item)?))
            .collect::<io::Result<Vec<_>>>()
    })?;
    Ok((rows.len(), json!({ "components": rows })))
}

/// The model's id, head and tags, and what its head Version says.
fn row(reader: &Reader<'_>, model: &Value) -> io::Result<Value> {
    let head = model
        .get("head")
        .filter(|head| !head.is_null())
        .map(|head| head.as_str().ok_or_else(|| invalid("list model head")))
        .transpose()?;
    let version = match head {
        Some(head) if !legacy_deprecated(model) => head_version(reader, head)?,
        _ => None,
    };
    let deprecated = if legacy_deprecated(model) {
        json!(true)
    } else if head.is_none() {
        json!(false)
    } else {
        version
            .as_ref()
            .map_or(Value::Null, |version| json!(deprecated(version)))
    };
    Ok(json!({
        "scope": model["scope"],
        "name": model["name"],
        "head": head,
        "versions": model.get("versions").cloned().unwrap_or_else(|| json!({})),
        "deprecated": deprecated,
        "laneReadmeOf": version.as_ref().map_or_else(|| Ok(Vec::new()), lane_readme_of)?,
    }))
}

/// The backward-compatible `deprecated` prop of the model.
fn legacy_deprecated(model: &Value) -> bool {
    model["deprecated"] == true
}

/// The head Version, `None` when it is not stored locally.
fn head_version(reader: &Reader<'_>, head: &str) -> io::Result<Option<Value>> {
    crate::merge_history::hash(head)?;
    if !reader.directory
        .join(&head[..2])
        .join(&head[2..])
        .is_file()
    {
        return Ok(None);
    }
    reader.read(head, "Version").map(Some)
}

/// `findCoreExtension(id)`: the config of the extension named `id`.
fn core_config<'v>(version: &'v Value, id: &str) -> Option<&'v Value> {
    version["extensions"]
        .as_array()?
        .iter()
        .find(|extension| extension["name"] == id)
        .map(|extension| &extension["config"])
}

/// `isDeprecated` without a specific version: `config.deprecate`.
fn deprecated(version: &Value) -> bool {
    core_config(version, "teambit.component/deprecation")
        .is_some_and(|config| truthy(&config["deprecate"]))
}

/// `isLaneReadmeOf`: the lanes in `config.readme`.
fn lane_readme_of(version: &Value) -> io::Result<Vec<String>> {
    let Some(readme) = core_config(version, "teambit.lanes/lanes")
        .map(|config| &config["readme"])
        .filter(|readme| truthy(readme))
    else {
        return Ok(Vec::new());
    };
    let readme = readme.as_object().ok_or_else(|| invalid("list lane readme"))?;
    Ok(readme.keys().cloned().collect())
}

/// JavaScript truthiness.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

#[cfg(test)]
mod tests;

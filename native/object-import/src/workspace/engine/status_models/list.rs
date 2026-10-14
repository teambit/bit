//! `scopeList`: what `ComponentsList.listAll` reads of each model in the
//! scope index, `isDeprecated` and `isLaneReadmeOf` from its head Version.
//! A head Version missing locally is reported as unknown, as Node does.
//! On a lane, a component's head is its head on the lane, when the lane has
//! it (`getHeadRegardlessOfLane` after `populateLocalAndRemoteHeads`).

use super::{Reader, index, invalid};
use crate::read_budget::Budget;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::File,
    io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    /// The current lane, when it is not main.
    #[serde(default)]
    lane: Option<LaneId>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LaneId {
    scope: String,
    name: String,
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
    let lane_heads = match &request.lane {
        Some(lane) => lane_heads(&request.root, &reader, lane)?,
        None => HashMap::new(),
    };
    let rows = pool.install(|| {
        items
            .par_iter()
            .map(|item| {
                let model = index::model(&reader, item)?;
                let identity = format!(
                    "{}/{}",
                    model["scope"].as_str().unwrap_or_default(),
                    model["name"].as_str().unwrap_or_default(),
                );
                row(&reader, &model, lane_heads.get(&identity).map(String::as_str))
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    let mut lane_components: Vec<&String> = lane_heads.keys().collect();
    lane_components.sort();
    Ok((rows.len(), json!({ "components": rows, "laneComponents": lane_components })))
}

/// The visible components of the current lane and their heads
/// (`lane.getComponentHead`). The lane must be in the index.
fn lane_heads(
    root: &Path,
    reader: &Reader<'_>,
    lane: &LaneId,
) -> io::Result<HashMap<String, String>> {
    let index: Value = serde_json::from_slice(
        &Budget::new(4 * 1024 * 1024).read(File::open(root.join(".bit/index.json"))?)?,
    )
    .map_err(io::Error::other)?;
    let row = index["lanes"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| {
            row["id"]["scope"] == lane.scope.as_str()
                && row["id"]["name"] == lane.name.as_str()
        })
        .ok_or_else(|| invalid("list current lane absent"))?;
    let hash = row["hash"].as_str().ok_or_else(|| invalid("list lane hash"))?;
    let value = reader.read(hash, "Lane")?;
    let mut heads = HashMap::new();
    for component in
        value["components"].as_array().ok_or_else(|| invalid("list lane components"))?
    {
        let id = &component["id"];
        let (Some(scope), Some(name), Some(head)) =
            (id["scope"].as_str(), id["name"].as_str(), component["head"].as_str())
        else {
            return Err(invalid("list lane component"));
        };
        crate::merge_history::hash(head)?;
        heads.insert(format!("{scope}/{name}"), head.to_owned());
    }
    Ok(heads)
}

/// The model's id, head and tags, and what its head Version says. `lane`
/// is its head on the current lane.
fn row(reader: &Reader<'_>, model: &Value, lane: Option<&str>) -> io::Result<Value> {
    let head = match lane {
        Some(head) => Some(head),
        None => model
            .get("head")
            .filter(|head| !head.is_null())
            .map(|head| head.as_str().ok_or_else(|| invalid("list model head")))
            .transpose()?,
    };
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

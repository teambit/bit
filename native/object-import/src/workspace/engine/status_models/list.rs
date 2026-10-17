//! `scopeList`: what `ComponentsList.listAll` reads of each model in the
//! scope index, `isDeprecated` and `isLaneReadmeOf` from its head Version.
//! A head Version missing locally is reported as unknown, as Node does.
//! On a lane, a component's head is its head on the lane, when the lane has
//! it (`getHeadRegardlessOfLane` after `populateLocalAndRemoteHeads`).

pub(in crate::workspace::engine) mod http_lanes;
use super::{Reader, index, invalid};
use crate::read_budget::Budget;
use bit_client_transfer::remotes::Remote;
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
    let directory = crate::scope_path(&request.root).join("objects");
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Lanes {
    root: PathBuf,
    #[serde(default)]
    merge_data: bool,
    #[serde(default)]
    remote_scope: Option<String>,
    #[serde(default)]
    global_remotes_file: Option<PathBuf>,
}

/// `laneList`: each lane of the index (`listLanes`), in its order, with the
/// hash it is indexed by and its Lane object.
pub(in crate::workspace::engine) fn lanes(request: &Lanes) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    let remote = request.remote_scope
        .as_deref()
        .map(|scope| remote_repository(request, scope))
        .transpose()?;
    let index = match &remote {
        Some(path) => read_bare_index(path)?,
        None => read_index(&request.root)?,
    };
    let directory = remote
        .as_ref()
        .map_or_else(
            || crate::scope_path(&request.root).join("objects"),
            |path| path.join("objects"),
        );
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let rows = index["lanes"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if rows.len() > 4096 {
        return Err(invalid("list lane count"));
    }
    let lanes = rows
        .iter()
        .map(|row| {
            let hash = row["hash"].as_str().ok_or_else(|| invalid("list lane hash"))?;
            let lane = reader.read(hash, "Lane")?;
            let mut result = json!({ "hash": hash, "lane": lane });
            if request.merge_data {
                result["isMerged"] = json!(fully_merged(&reader, &index, &lane)?);
            }
            Ok(result)
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok((lanes.len(), json!({ "lanes": lanes })))
}

fn remote_repository(request: &Lanes, scope: &str) -> io::Result<PathBuf> {
    let Remote::File(path) =
        configured_remote(&request.root, scope, request.global_remotes_file.as_deref())?
    else {
        return Err(invalid("list HTTP remote requires canonical adapter"));
    };
    super::super::path(&path)?;
    let config = read_json_file(&path.join("scope.json"))?;
    if config["name"] != scope {
        return Err(invalid("list remote identity"));
    }
    Ok(path)
}

pub(super) fn configured_remote(
    root: &Path,
    scope: &str,
    global_remotes_file: Option<&Path>,
) -> io::Result<Remote> {
    if scope.is_empty() || scope.contains('/') || scope == "." || scope == ".." {
        return Err(invalid("list remote scope"));
    }
    let local = read_json_file(&crate::scope_path(root).join("scope.json"))?;
    let host = local["remotes"][scope]
        .as_str()
        .map(str::to_owned)
        .or_else(|| {
            let path = global_remotes_file?;
            let global = read_json_file(path).ok()?;
            global[scope].as_str().map(str::to_owned)
        })
        .ok_or_else(|| invalid("list unconfigured remote"))?;
    Remote::from_host(&host)
}

fn read_bare_index(root: &Path) -> io::Result<Value> {
    let index = read_json_file(&root.join("index.json"))?;
    if !index["lanes"].is_array() || !index["components"].is_array() {
        return Err(invalid("list remote index"));
    }
    Ok(index)
}

pub(super) fn read_json_file(path: &Path) -> io::Result<Value> {
    serde_json::from_slice(&Budget::new(4 * 1024 * 1024).read(File::open(path)?)?)
        .map_err(io::Error::other)
}

/// `Lane.isFullyMerged`: every visible lane head is in its component's
/// main-head ancestry. Hidden update-dependents do not participate.
fn fully_merged(reader: &Reader<'_>, index: &Value, lane: &Value) -> io::Result<bool> {
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("list lane components"))?;
    let indexed = index["components"].as_array().ok_or_else(|| invalid("list component index"))?;
    for component in components {
        let id = &component["id"];
        let Some(model_row) = indexed
            .iter()
            .find(|row| row["id"] == *id)
        else {
            return Ok(false);
        };
        let hash = model_row["hash"].as_str().ok_or_else(|| invalid("list component hash"))?;
        let model = reader.read(hash, "Component")?;
        let Some(main_head) = model["head"].as_str() else { return Ok(false) };
        let lane_head = component["head"].as_str().ok_or_else(|| invalid("list lane head"))?;
        crate::merge_history::hash(lane_head)?;
        if !head_contains(reader, main_head, lane_head)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn head_contains(reader: &Reader<'_>, main_head: &str, lane_head: &str) -> io::Result<bool> {
    let mut pending = vec![main_head.to_owned()];
    let mut seen = std::collections::HashSet::new();
    while let Some(hash) = pending.pop() {
        if hash == lane_head {
            return Ok(true);
        }
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("list merged history budget"));
        }
        let version = reader.read(&hash, "Version")?;
        let parents =
            version["parents"].as_array().ok_or_else(|| invalid("list merged parents"))?;
        for parent in parents {
            let parent = parent.as_str().ok_or_else(|| invalid("list merged parent"))?;
            crate::merge_history::hash(parent)?;
            pending.push(parent.to_owned());
        }
    }
    Ok(false)
}

/// `.bit/index.json`, empty when the scope has none.
fn read_index(root: &Path) -> io::Result<Value> {
    let file = match File::open(crate::scope_path(root).join("index.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(json!({})),
        Err(error) => return Err(error),
    };
    serde_json::from_slice(&Budget::new(4 * 1024 * 1024).read(file)?).map_err(io::Error::other)
}

/// The visible components of the current lane and their heads
/// (`lane.getComponentHead`). The lane must be in the index.
fn lane_heads(
    root: &Path,
    reader: &Reader<'_>,
    lane: &LaneId,
) -> io::Result<HashMap<String, String>> {
    let index = read_index(root)?;
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

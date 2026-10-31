//! `scopeList`: what `ComponentsList.listAll` reads of each model in the
//! scope index, `isDeprecated` and `isLaneReadmeOf` from its head Version.

pub(in crate::workspace::engine) mod http_lanes;
#[cfg(test)]
mod tests;

use super::{Reader, index, invalid};
use crate::read_budget::Budget;
use bit_client_transfer::remotes::Remote;
use http_lanes::{
    read_json_file, read_local_bare_index, remote_for_lane, scope_directory, validate_bare_scope,
};
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
    #[serde(default)]
    bare_scope: bool,
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
    if request.bare_scope {
        validate_bare_scope(&request.root)?;
    }
    let items = if request.bare_scope {
        index::read_at(&request.root)?
    } else {
        index::read(&request.root)?
    };
    let directory = scope_directory(&request.root, request.bare_scope).join("objects");
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(256 * 1024 * 1024),
        packed: Budget::new(256 * 1024 * 1024),
    };
    let lane_heads = match &request.lane {
        Some(lane) => lane_heads(&request.root, request.bare_scope, &reader, lane)?,
        None => HashMap::new(),
    };
    let rows = pool.install(|| {
        items
            .par_iter()
            .map(|item| {
                let model = index::model(&reader, item)?;
                let head = lookup_lane_head(&lane_heads, &model);
                row(&reader, &model, head)
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    let mut lane_components: Vec<&String> = lane_heads.keys().collect();
    lane_components.sort();
    Ok((rows.len(), json!({ "components": rows, "laneComponents": lane_components })))
}

fn lookup_lane_head<'a>(lane_heads: &'a HashMap<String, String>, model: &Value) -> Option<&'a str> {
    let scope = model["scope"].as_str().unwrap_or_default();
    let name = model["name"].as_str().unwrap_or_default();
    if !scope.is_empty() {
        return lane_heads
            .get(&format!("{scope}/{name}"))
            .map(String::as_str);
    }
    lane_heads
        .get(name)
        .or_else(|| {
            let suffix = format!("/{name}");
            lane_heads
                .iter()
                .find_map(|(key, val)| key.ends_with(&suffix).then_some(val))
        })
        .map(String::as_str)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Lanes {
    root: PathBuf,
    #[serde(default)]
    bare_scope: bool,
    #[serde(default)]
    merge_data: bool,
    #[serde(default)]
    remote_scope: Option<String>,
    #[serde(default)]
    global_remotes_file: Option<PathBuf>,
    #[serde(default)]
    remote_host: Option<String>,
}

/// `laneList`: each lane of the index (`listLanes`), in its order, with the
/// hash it is indexed by and its Lane object.
pub(in crate::workspace::engine) fn lanes(request: &Lanes) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    if request.bare_scope {
        validate_bare_scope(&request.root)?;
    }
    let remote = request.remote_scope
        .as_deref()
        .map(|scope| remote_repository(request, scope))
        .transpose()?;
    let index = match &remote {
        Some(path) => read_local_bare_index(path)?,
        None if request.bare_scope => read_local_bare_index(&request.root)?,
        None => read_index(&request.root)?,
    };
    let directory = remote
        .as_ref()
        .map_or_else(
            || scope_directory(&request.root, request.bare_scope).join("objects"),
            |path| path.join("objects"),
        );
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let lanes = lane_entries(&reader, &index, request.merge_data)?;
    Ok((lanes.len(), json!({ "lanes": lanes })))
}

fn lane_entries(reader: &Reader<'_>, index: &Value, merge_data: bool) -> io::Result<Vec<Value>> {
    let rows = index["lanes"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if rows.len() > 4096 {
        return Err(invalid("list lane count"));
    }
    rows.iter()
        .filter(|row| row["isSymlink"] != true)
        .map(|row| {
            let hash = row["hash"].as_str().ok_or_else(|| invalid("list lane hash"))?;
            let lane = reader.read(hash, "Lane")?;
            let mut result = json!({ "hash": hash, "lane": lane });
            if merge_data {
                result["isMerged"] = json!(fully_merged(reader, index, &lane)?);
            }
            Ok(result)
        })
        .collect::<io::Result<Vec<_>>>()
}

fn remote_repository(request: &Lanes, scope: &str) -> io::Result<PathBuf> {
    let Remote::File(path) = remote_for_lane(
        &request.root,
        request.bare_scope,
        scope,
        request.global_remotes_file.as_deref(),
        request.remote_host.as_deref(),
    )?
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

fn find_indexed_component<'a>(indexed: &'a [Value], component: &Value) -> Option<&'a Value> {
    let (comp_scope, comp_name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(component)
            .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
    indexed
        .iter()
        .find(|row| {
            let (row_scope, row_name) =
                crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
                    .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
            row["isSymlink"] != true
                && row_name == comp_name
                && (row_scope == comp_scope || row_scope.is_empty())
        })
}

/// `Lane.isFullyMerged`: every visible lane head is in its component's
/// main-head ancestry. Hidden update-dependents do not participate.
fn fully_merged(reader: &Reader<'_>, index: &Value, lane: &Value) -> io::Result<bool> {
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("list lane components"))?;
    let indexed = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("list component index"))?;
    for component in components {
        if component["isHidden"] == true {
            continue;
        }
        let Some(model_row) = find_indexed_component(indexed, component) else {
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

fn read_index(root: &Path) -> io::Result<Value> {
    let file = match File::open(crate::scope_path(root).join("index.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(json!({})),
        Err(error) => return Err(error),
    };
    crate::parse_jsonc(&Budget::new(4 * 1024 * 1024).read(file)?).map_err(io::Error::other)
}

fn lane_heads(
    root: &Path,
    bare: bool,
    reader: &Reader<'_>,
    lane: &LaneId,
) -> io::Result<HashMap<String, String>> {
    let index = if bare { read_local_bare_index(root)? } else { read_index(root)? };
    let row = index["lanes"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| {
            row["isSymlink"] != true
                && crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                    row,
                    lane.scope.as_str(),
                    lane.name.as_str(),
                )
        })
        .ok_or_else(|| invalid("list current lane absent"))?;
    let hash = row["hash"].as_str().ok_or_else(|| invalid("list lane hash"))?;
    let value = reader.read(hash, "Lane")?;
    parse_lane_heads(&value, &lane.scope)
}

pub(super) fn parse_lane_heads(
    value: &Value,
    lane_scope: &str,
) -> io::Result<HashMap<String, String>> {
    let mut heads = HashMap::new();
    for component in
        value["components"].as_array().ok_or_else(|| invalid("list lane components"))?
    {
        if component["isHidden"] == true {
            continue;
        }
        let Some((scope, name)) =
            crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(component)
        else {
            return Err(invalid("list lane component"));
        };
        let scope = scope.unwrap_or(lane_scope);
        let head = component["head"].as_str().ok_or_else(|| invalid("list lane component"))?;
        crate::merge_history::hash(head)?;
        heads.insert(format!("{scope}/{name}"), head.to_owned());
    }
    Ok(heads)
}

fn row(reader: &Reader<'_>, model: &Value, lane: Option<&str>) -> io::Result<Value> {
    let head = match lane {
        Some(head) => Some(head),
        None => model
            .get("head")
            .filter(|head| !head.is_null())
            .map(|head| head.as_str().ok_or_else(|| invalid("list model head")))
            .transpose()?,
    };
    let is_legacy_dep = model["deprecated"] == true;
    let version = match head {
        Some(head) if !is_legacy_dep => head_version(reader, head)?,
        _ => None,
    };
    let deprecated = if is_legacy_dep {
        json!(true)
    } else if head.is_none() {
        json!(false)
    } else {
        version
            .as_ref()
            .map_or(Value::Null, |version| json!(deprecated(version)))
    };
    Ok(json!({
        "scope": model["scope"], "name": model["name"], "head": head,
        "versions": model.get("versions").cloned().unwrap_or_else(|| json!({})),
        "orphanedVersions": model.get("orphanedVersions").cloned().unwrap_or_else(|| json!({})),
        "deprecated": deprecated,
        "laneReadmeOf": version.as_ref().map_or_else(|| Ok(Vec::new()), lane_readme_of)?,
    }))
}

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

fn core_config<'v>(version: &'v Value, id: &str) -> Option<&'v Value> {
    version["extensions"]
        .as_array()?
        .iter()
        .find(|extension| {
            crate::workspace::engine::client_status::config::is_extension_aspect(extension, id)
        })
        .map(|extension| &extension["config"])
}

fn deprecated(version: &Value) -> bool {
    core_config(version, "teambit.component/deprecation")
        .is_some_and(|config| truthy(&config["deprecate"]))
}

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

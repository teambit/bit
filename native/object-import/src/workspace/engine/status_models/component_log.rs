//! Local `bit log` history: validated model and Version reads, following parents from main's head.

use super::{Reader, Request as ModelsRequest, invalid, lane, load};
use crate::{merge_history, read_budget::Budget, read_version};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    identity: String,
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
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let model = model(request, pool)?;
    let main = model["head"].as_str();
    let lane = lane_head(request)?;
    let Some(head) = lane.as_deref().or(main) else {
        return Ok((0, json!({"versions":[]})));
    };
    merge_history::hash(head)?;
    let main_refs = if lane.is_some() {
        main.map(|head| traverse(&request.root.join(".bit/objects"), head, &tags(&model)?, None))
            .transpose()?
            .unwrap_or_default()
            .into_iter()
            .filter_map(|row| row["hash"].as_str().map(str::to_owned))
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
    };
    let output = traverse(
        &request.root.join(".bit/objects"),
        head,
        &tags(&model)?,
        lane.as_ref().map(|_| &main_refs),
    )?;
    if main.is_some_and(|head| {
        lane.is_some()
            && !output
                .iter()
                .any(|row| row["hash"] == head)
    }) {
        return Err(invalid("component log diverged lane history"));
    }
    Ok((output.len(), json!({"versions":output})))
}

fn lane_head(request: &Request) -> io::Result<Option<String>> {
    let Some(id) = &request.lane else { return Ok(None) };
    let directory = request.root.join(".bit/objects");
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let name = format!("{}/{}", id.scope, id.name);
    Ok(lane::read(&request.root, &reader, &name)?
        .and_then(|lane| lane.heads.get(&request.identity).cloned()))
}

fn model(request: &Request, pool: &ThreadPool) -> io::Result<Value> {
    let snapshot = load(
        &ModelsRequest {
            root: request.root.clone(),
            targets: Vec::new(),
            history: false,
            include_heads: false,
            stage_history: false,
            current_lane_id: None,
        },
        pool,
        false,
    )?;
    let model = snapshot.models
        .into_iter()
        .find(|model| {
            let scope = model["scope"].as_str().unwrap_or_default();
            let name = model["name"].as_str().unwrap_or_default();
            let identity =
                if scope.is_empty() { name.to_string() } else { format!("{scope}/{name}") };
            identity == request.identity
        })
        .ok_or_else(|| invalid("component log model absent"))?;
    if model["deprecated"] == true {
        return Err(invalid("component log deprecation overlay"));
    }
    Ok(model)
}

fn traverse(
    directory: &Path,
    head: &str,
    tags: &HashMap<String, String>,
    main_refs: Option<&HashSet<String>>,
) -> io::Result<Vec<Value>> {
    let mut reader = read_version::Reader::query(directory)?;
    let mut queue = VecDeque::from([head.to_string()]);
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    while let Some(reference) = queue.pop_front() {
        if !seen.insert(reference.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("component log history limit"));
        }
        let version = reader.read(&reference)?;
        let (mut row, parents) = row(&reference, &version, tags)?;
        if let Some(main_refs) = main_refs {
            row["onLane"] = json!(!main_refs.contains(&reference));
        }
        queue.extend(parents);
        output.push(row);
    }
    Ok(output)
}

fn row(
    reference: &str,
    version: &Value,
    tags: &HashMap<String, String>,
) -> io::Result<(Value, Vec<String>)> {
    if has_control_aspect(version) {
        return Err(invalid("component log removal or deprecation overlay"));
    }
    let parents = version["parents"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let parents: Vec<String> = parents
        .iter()
        .map(|parent| {
            parent
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| invalid("component log parent"))
        })
        .collect::<io::Result<_>>()?;
    let log = version["log"].as_object().ok_or_else(|| invalid("component log metadata"))?;
    if log
        .get("message")
        .and_then(Value::as_str)
        .is_none()
    {
        return Err(invalid("component log message"));
    }
    let mut row = json!({
        "log": log,
        "hash": reference,
        "parents": parents,
        "onLane": false,
        "deleted": false,
    });
    if let Some(tag) = tags.get(reference) {
        row["tag"] = json!(tag);
    }
    if let Some(hidden) = version.get("hidden") {
        row["hidden"] = hidden.clone();
    }
    Ok((row, parents))
}

fn has_control_aspect(version: &Value) -> bool {
    version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    let name = extension["name"].as_str();
                    name == Some("teambit.component/remove")
                        || name == Some("teambit.component/deprecation")
                })
        })
}

/// Read the same validated Component and Version objects from a configured
/// bare `file://` scope. A missing Component has an empty history in Bit.
pub(in crate::workspace::engine) fn read_file_remote(
    path: &Path,
    identity: &str,
) -> io::Result<Vec<Value>> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("file remote log identity"))?;
    if !path.is_absolute() || !fs::metadata(path)?.is_dir() {
        return Err(invalid("file remote log scope path"));
    }
    let scope_file = fs::File::open(path.join("scope.json"))?;
    let config: Value = serde_json::from_slice(&Budget::new(1024 * 1024).read(scope_file)?)?;
    if config["name"] != scope {
        return Err(invalid("file remote log scope name"));
    }
    if config["lanes"]["current"]
        .as_str()
        .is_some_and(|current| current != "main")
    {
        return Err(invalid("file remote log active lane"));
    }
    let directory = path.join("objects");
    let reader = Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let hash = crate::validate::hexadecimal(&Sha1::digest(identity.as_bytes()));
    let model = match reader.read(&hash, "Component") {
        Ok(model) => model,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    if model["scope"] != scope || model["name"] != name {
        return Err(invalid("file remote log model identity"));
    }
    let Some(head) = model["head"].as_str() else { return Ok(Vec::new()) };
    let mut rows = traverse(&directory, head, &tags(&model)?, None)?;
    rows.sort_by(file_date_order);
    rows.iter()
        .map(file_remote_row)
        .collect()
}

fn file_remote_row(row: &Value) -> io::Result<Value> {
    let mut log = row["log"]
        .as_object()
        .ok_or_else(|| invalid("file remote log metadata"))?
        .clone();
    for key in ["username", "email"] {
        if log
            .get(key)
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            log.insert(key.into(), json!("unknown"));
        }
    }
    if let Some(tag) = row.get("tag") {
        log.insert("tag".into(), tag.clone());
    }
    for key in ["hash", "parents", "onLane", "deleted"] {
        log.insert(key.into(), row[key].clone());
    }
    if let Some(hidden) = row.get("hidden") {
        log.insert("hidden".into(), hidden.clone());
    }
    Ok(Value::Object(log))
}

fn file_date_order(left: &Value, right: &Value) -> std::cmp::Ordering {
    let millis = |row: &Value| {
        row["log"]["date"]
            .as_str()
            .and_then(|date| date.parse::<i64>().ok())
    };
    match (millis(left), millis(right)) {
        (Some(left), Some(right)) => left.cmp(&right),
        _ => std::cmp::Ordering::Equal,
    }
}

fn tags(model: &Value) -> io::Result<HashMap<String, String>> {
    let mut tags = HashMap::new();
    for field in ["versions", "orphanedVersions"] {
        let Some(versions) = model
            .get(field)
            .filter(|value| !value.is_null())
        else {
            continue;
        };
        let versions = versions.as_object().ok_or_else(|| invalid("component log tags"))?;
        for (tag, reference) in versions {
            let reference = reference.as_str().ok_or_else(|| invalid("component log tag ref"))?;
            merge_history::hash(reference)?;
            insert_tag(&mut tags, reference, tag, field == "versions");
        }
    }
    Ok(tags)
}

fn insert_tag(tags: &mut HashMap<String, String>, reference: &str, tag: &str, ordinary: bool) {
    if ordinary {
        tags.insert(reference.to_string(), tag.to_string());
    } else {
        tags.entry(reference.to_string()).or_insert_with(|| tag.to_string());
    }
}

#[cfg(test)]
mod tests;

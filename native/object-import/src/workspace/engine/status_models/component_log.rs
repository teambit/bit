//! Local `bit log` history: validated model and Version reads, following parents from main's head.

use super::{Request as ModelsRequest, invalid, load};
use crate::{merge_history, read_version};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    identity: String,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let model = model(request, pool)?;
    let Some(head) = model["head"].as_str() else {
        return Ok((0, json!({"versions":[]})));
    };
    merge_history::hash(head)?;
    let output = traverse(&request.root, head, &tags(&model)?)?;
    Ok((output.len(), json!({"versions":output})))
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
    root: &std::path::Path,
    head: &str,
    tags: &HashMap<String, String>,
) -> io::Result<Vec<Value>> {
    let directory = root.join(".bit/objects");
    let mut reader = read_version::Reader::query(&directory)?;
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
        let (row, parents) = row(&reference, &version, tags)?;
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
            tags.entry(reference.to_string()).or_insert_with(|| tag.clone());
        }
    }
    Ok(tags)
}

#[cfg(test)]
mod tests;

mod detected;
mod issues;

use super::{invalid, pipeline};
use crate::workspace::engine::{path, read_dependency_cache, resolve_dependencies::normalize};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    root: PathBuf,
    component_root: PathBuf,
    identity: String,
    files: Vec<PathBuf>,
    policies: Value,
    finish: Value,
    resolution: Value,
}

/// Read the pre-policy dependency cache and apply current policies entirely
/// within the cold command. A missing or stale cache retains canonical loading.
pub(in crate::workspace::engine) fn apply(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    validate(request)?;
    let detected = load(request, pool)?;
    let mut initial = detected::initial(&detected, &request.finish)?;
    initial["policies"] = request.policies.clone();
    let input =
        serde_json::from_value(json!({"root":request.root,"componentRoot":request.component_root,
        "initial":initial,"finish":request.finish,"resolution":request.resolution}))
        .map_err(io::Error::other)?;
    let (_, mut output) = pipeline::apply(&input, pool)?;
    output["issues"] = issues::apply(&detected["issues"], &output)?;
    Ok((1, output))
}

fn load(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Value> {
    if request.root == request.component_root {
        return Ok(
            json!({"allDependencies":{"dependencies":[],"devDependencies":[],"peerDependencies":[]},
            "allPackagesDependencies":{"packageDependencies":{},"devPackageDependencies":{},"peerPackageDependencies":{}},
            "issues":[]}),
        );
    }
    let input =
        serde_json::from_value(json!({"cache":request.root.join(".bit/cache/components/deps"),
        "key":request.identity}))
        .map_err(io::Error::other)?;
    let (_, result) = read_dependency_cache::read(&input)?;
    let cache =
        result["cache"].as_object().ok_or_else(|| invalid("status missing dependency cache"))?;
    let mut files = request.files.clone();
    files.push(request.component_root.join("component.json"));
    let input = serde_json::from_value(json!({"root":request.component_root,"files":files,
        "timestamp":cache["timestamp"]}))
    .map_err(io::Error::other)?;
    let (_, freshness) = read_dependency_cache::freshness(&input, pool)?;
    if freshness["stale"] != false {
        return Err(invalid("status stale dependency cache"));
    }
    let data = cache
        .get("data")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("status dependency cache data"))?;
    serde_json::from_str(data).map_err(io::Error::other)
}

fn validate(request: &Request) -> io::Result<()> {
    path(&request.root)?;
    path(&request.component_root)?;
    if normalize(&request.root) != request.root
        || normalize(&request.component_root) != request.component_root
        || !request.component_root.starts_with(&request.root)
        || request.files.len() > 65536
        || request.finish["selfIdentity"] != request.identity
    {
        return Err(invalid("status dependency workspace boundary"));
    }
    for file in &request.files {
        path(file)?;
        if normalize(file) != *file
            || !file.starts_with(&request.component_root)
            || file
                .file_name()
                .is_some_and(|name| name == "env.jsonc")
        {
            return Err(invalid("status dependency file boundary or custom environment"));
        }
    }
    if request.component_root.join("env.jsonc").try_exists()? {
        return Err(invalid("status custom environment requires canonical loading"));
    }
    Ok(())
}

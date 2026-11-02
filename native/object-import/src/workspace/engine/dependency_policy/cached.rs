//! Pre-policy dependency cache loading via [`apply`], [`detected`], [`issues`], and [`pipeline`].

mod detected;
mod issues;

use super::{invalid, pipeline};
use crate::workspace::engine::{
    path, read_dependency_cache, resolve_dependencies::normalize, source_overlay::SourceOverlay,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

/// Wire payload for applying dependency policies to a cached pre-policy detection snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
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
    let Some(detected) = load(request, pool)? else {
        return Ok((0, json!({"needsDetection":true})));
    };
    complete(
        &Complete {
            root: request.root.clone(),
            component_root: request.component_root.clone(),
            detected,
            policies: request.policies.clone(),
            finish: request.finish.clone(),
            resolution: request.resolution.clone(),
        },
        pool,
    )
}
/// Wire payload for completing dependency policy evaluation from a pre-loaded detection snapshot.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    root: PathBuf,
    component_root: PathBuf,
    detected: Value,
    policies: Value,
    finish: Value,
    resolution: Value,
}
/// Completes dependency policy evaluation for `request` against the workspace filesystem.
#[inline]
pub(in crate::workspace::engine) fn complete(
    request: &Complete,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    complete_view(request, pool, None)
}
/// Completes dependency policy evaluation for `request` ([`Complete`]) against an in-memory [`SourceOverlay`] via [`complete_view`].
#[inline]
pub(in crate::workspace::engine) fn complete_overlay(
    request: &Complete,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
) -> io::Result<(usize, Value)> {
    complete_view(request, pool, Some(overlay))
}
/// Runs [`detected::initial`], [`pipeline`], and [`issues::apply`] for `request` with an optional [`SourceOverlay`].
fn complete_view(
    request: &Complete,
    pool: &rayon::ThreadPool,
    overlay: Option<&SourceOverlay>,
) -> io::Result<(usize, Value)> {
    let mut initial = detected::initial(&request.detected, &request.finish)?;
    initial["policies"] = request.policies.clone();
    let input =
        serde_json::from_value(json!({"root":request.root,"componentRoot":request.component_root,
        "initial":initial,"finish":request.finish,"resolution":request.resolution}))
        .map_err(io::Error::other)?;
    let (_, mut output) = match overlay {
        Some(view) => pipeline::apply_overlay(&input, pool, view)?,
        None => pipeline::apply(&input, pool)?,
    };
    output["issues"] = issues::apply(&request.detected["issues"], &output)?;
    Ok((1, output))
}

fn load(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Option<Value>> {
    if request.root == request.component_root {
        return Ok(Some(
            json!({"allDependencies":{"dependencies":[],"devDependencies":[],"peerDependencies":[]},
            "allPackagesDependencies":{"packageDependencies":{},"devPackageDependencies":{},"peerPackageDependencies":{}},
            "issues":[]}),
        ));
    }
    let input = serde_json::from_value(
        json!({"cache":crate::scope_path(&request.root).join("cache/components/deps"),
        "key":request.identity.trim()}),
    )
    .map_err(io::Error::other)?;
    let (_, result) = read_dependency_cache::read(&input)?;
    if result["cache"].is_null() {
        return Ok(None);
    }
    let cache =
        result["cache"].as_object().ok_or_else(|| invalid("status dependency cache shape"))?;
    let component_json = request.component_root.join("component.json");
    let files = if request.files.contains(&component_json) {
        std::borrow::Cow::Borrowed(&request.files[..])
    } else {
        let mut files = Vec::with_capacity(request.files.len() + 1);
        files.extend_from_slice(&request.files);
        files.push(component_json);
        std::borrow::Cow::Owned(files)
    };
    let input = serde_json::from_value(
        json!({"root":request.component_root,"files":files,"timestamp":cache["timestamp"]}),
    )
    .map_err(io::Error::other)?;
    if read_dependency_cache::freshness(&input, pool)?.1["stale"] != false {
        return Ok(None);
    }
    parse_cached_data(cache).map(Some)
}

#[inline]
fn parse_cached_data(cache: &serde_json::Map<String, Value>) -> io::Result<Value> {
    let data = cache
        .get("data")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|data| !data.is_empty() && data.len() <= 16 * 1024 * 1024)
        .ok_or_else(|| invalid("status dependency cache data"))?;
    let parsed: Value = serde_json::from_str(data).map_err(io::Error::other)?;
    parsed
        .is_object()
        .then_some(parsed)
        .ok_or_else(|| invalid("status dependency cache data"))
}

fn validate(request: &Request) -> io::Result<()> {
    path(&request.root)?;
    path(&request.component_root)?;
    let identity = request.identity.trim();
    if identity.is_empty()
        || normalize(&request.root) != request.root
        || normalize(&request.component_root) != request.component_root
        || !request.component_root.starts_with(&request.root)
        || request.files.len() > 65536
        || request.finish["selfIdentity"].as_str().map(str::trim) != Some(identity)
    {
        return Err(invalid("status dependency workspace boundary"));
    }
    for file in &request.files {
        path(file)?;
        if normalize(file) != *file || !file.starts_with(&request.component_root) {
            return Err(invalid("status dependency file boundary or custom environment"));
        }
    }
    Ok(())
}

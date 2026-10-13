pub(in crate::workspace::engine) use wire::{Complete, Detect};

mod complete;
mod packages;
mod project;
#[cfg(test)]
mod tests;
mod wire;

use super::{cached, invalid};
use crate::workspace::engine::{
    dependency_graph::{self, proof},
    path,
    resolve_dependencies::normalize,
};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine) fn detect(
    request: &Detect,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    validate(request)?;
    validate_packages(request)?;
    let mut controls = controls(request)?;
    let mut graph = request.detection.graph.clone();
    let object = graph.as_object_mut().ok_or_else(|| invalid("fresh dependency graph grammar"))?;
    for (key, value) in [
        ("root", json!(request.component_root)),
        ("files", json!(request.files)),
        ("includeNpm", json!(true)),
        ("visited", json!({})),
    ] {
        if object.insert(key.to_owned(), value).is_some() {
            return Err(invalid("fresh graph ownership"));
        }
    }
    let graph = serde_json::from_value(graph).map_err(io::Error::other)?;
    let (_, mut captured) = dependency_graph::capture(&graph, pool, true)?;
    let mut source_proofs: Vec<proof::Proof> =
        serde_json::from_value(captured["readSet"].clone()).map_err(io::Error::other)?;
    controls.append(&mut source_proofs);
    captured["readSet"] = serde_json::to_value(controls).map_err(io::Error::other)?;
    project::project(request, &captured).map(|value| (request.files.len(), value))
}
pub(in crate::workspace::engine) fn apply(
    request: &Complete,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    pool.install(|| proof::verify(&request.capture.read_set))?;
    let detected = complete::detected(request)?;
    let input = serde_json::from_value(json!({"root":request.root,"componentRoot":request.component_root,
        "detected":detected,"policies":request.policies,"finish":request.finish,"resolution":request.resolution})).map_err(io::Error::other)?;
    let (_, mut output) = cached::complete(&input, pool)?;
    output["rawData"] = Value::String(serde_json::to_string(&detected).map_err(io::Error::other)?);
    output["cacheable"] = json!(request.root != request.component_root);
    Ok((1, output))
}
fn validate(request: &Detect) -> io::Result<()> {
    path(&request.root)?;
    path(&request.component_root)?;
    if !request.component_root.starts_with(&request.root)
        || normalize(&request.root) != request.root
        || normalize(&request.component_root) != request.component_root
        || request.files.len() > 4096
    {
        return Err(invalid("fresh dependency workspace boundary"));
    }
    for file in &request.files {
        path(file)?;
        if !file.starts_with(&request.component_root) || normalize(file) != *file {
            return Err(invalid("fresh dependency source boundary"));
        }
    }
    for file in &request.detection.dev_files {
        if file.is_empty()
            || std::path::Path::new(file).is_absolute()
            || file
                .split('/')
                .any(|part| matches!(part, ".." | "."))
        {
            return Err(invalid("fresh dependency dev file"));
        }
    }
    Ok(())
}

fn controls(request: &Detect) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for file in [
        request.root.join(".bitmap"),
        request.root.join("workspace.jsonc"),
        request.root.join("package.json"),
        request.component_root.join("component.json"),
        request.component_root.join("package.json"),
    ] {
        proof::read(&file, &mut proofs)?;
    }
    Ok(proofs)
}

fn validate_packages(request: &Detect) -> io::Result<()> {
    for packages in
        request.detection.model_packages.iter().chain(&request.detection.workspace_policy)
    {
        if packages
            .values()
            .any(|value| value.as_str().is_none_or(str::is_empty))
        {
            return Err(invalid("fresh dependency version map requires canonical fallback"));
        }
    }
    Ok(())
}

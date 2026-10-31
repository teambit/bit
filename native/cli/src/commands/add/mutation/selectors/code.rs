//! File-only predicates use native source hashing without class or dependency-cache loads.
use super::super::{controls, load};
use crate::commands::engine::Engine;
use serde_json::{Map, Value, json};
use std::{io, path::Path};

const FIELDS: [&str; 9] = [
    "mainFile",
    "dependencies",
    "devDependencies",
    "packageDependencies",
    "devPackageDependencies",
    "peerPackageDependencies",
    "bindingPrefix",
    "overrides",
    "extensions",
];

pub(super) fn compare(
    engine: &mut Engine,
    root: &Path,
    bitmap: &Value,
    context: &Value,
    ids: &[String],
) -> io::Result<(Value, Vec<Value>)> {
    let (_, projection) = load::projected(root, bitmap, ids)?;
    let targets = projection.workspace.components
        .iter()
        .filter(|component| ids.contains(&component.id.to_string_without_version()))
        .map(|component| target(context, component))
        .collect::<io::Result<Vec<_>>>()?;
    let targets = targets
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let before = source_proofs(root, &targets)?;
    let result = engine.request(&json!({"kind":"statusCompare","root":root,"targets":targets}))?;
    if source_proofs(root, &targets)? != before {
        return Err(io::Error::other("state predicate sources changed"));
    }
    Ok((result, before))
}
fn target(
    context: &Value,
    component: &bit_install::model::WorkspaceComponent,
) -> io::Result<Option<Value>> {
    let Some(version) = component.id.version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty())
    else {
        return Ok(None);
    };
    let id = component.id.to_string_without_version();
    let stored = stored(context, &id, version)?;
    let current: Map<String, Value> = stored[1]
        .as_object()
        .ok_or_else(|| io::Error::other("code predicate fields"))?
        .iter()
        .filter(|(name, _)| FIELDS.contains(&name.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    Ok(Some(
        json!({"identity":id,"version":version,"directory":component.root_dir,"files":component.files,"current":current}),
    ))
}
fn stored<'a>(context: &'a Value, id: &str, version: &str) -> io::Result<&'a Value> {
    let id = id.trim();
    let version = version.trim();
    let model = context["models"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"]
                    .as_str()
                    .map(str::trim)
                    .unwrap_or_default(),
                model["name"]
                    .as_str()
                    .map(str::trim)
                    .unwrap_or_default(),
            ) == id
        })
        .ok_or_else(|| io::Error::other("code predicate model"))?;
    let hash = if version.is_empty() || matches!(version, "latest" | "head") {
        model["head"].as_str().map_or(version, str::trim)
    } else {
        model["versions"][version]
            .as_str()
            .or_else(|| model["orphanedVersions"][version].as_str())
            .map_or(version, str::trim)
    };
    let stored = context["versions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| row[0].as_str().map(str::trim) == Some(hash))
        .ok_or_else(|| io::Error::other("code predicate version"))?;
    Ok(stored)
}

fn source_proofs(root: &Path, targets: &[Value]) -> io::Result<Vec<Value>> {
    targets
        .iter()
        .flat_map(|row| {
            let directory = root.join(row["directory"].as_str().unwrap_or_default());
            row["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(move |file| directory.join(file))
        })
        .map(|path| controls::refresh(&path))
        .collect()
}

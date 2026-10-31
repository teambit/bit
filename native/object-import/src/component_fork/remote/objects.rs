use super::super::{required, unsupported};
use crate::{component_recover::probe::objects as shared, component_tracking::observe::Observed};
use bit_client_transfer::tar::ObjectItem;
use serde_json::{Value, json};
use std::{
    io,
    path::{Component, Path},
};
type Captured = (Value, Vec<(String, Vec<u8>)>, String, Vec<(String, Vec<u8>)>);

pub(super) fn file(scope: &Path, id: &str, observed: &mut Observed) -> io::Result<Captured> {
    let index: Value = serde_json::from_slice(&required(observed, &scope.join("index.json"))?)?;
    let row = model_row(&index, id)?;
    let hash = row["hash"].as_str().ok_or_else(|| unsupported("fork remote model hash"))?;
    let mut compressed = vec![(hash.to_owned(), retain(scope, hash, observed)?)];
    let (kind, model) = crate::read_scope_object(scope, hash)?.ok_or_else(|| missing(id))?;
    if kind != "Component" {
        return Err(unsupported("fork remote model type"));
    }
    let hash = shared::version_hash(&model, id)?;
    compressed.push((hash.clone(), retain(scope, &hash, observed)?));
    let (kind, version) = crate::read_scope_object(scope, &hash)?.ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(unsupported("fork remote version type"));
    }
    let mut total = 0;
    let mut files = Vec::new();
    for row in source_rows(&version)? {
        let (path, hash) = source(row)?;
        compressed.push((hash.into(), retain(scope, hash, observed)?));
        let bytes = crate::checkout::repository::source(
            &scope.join("objects"),
            crate::merge_history::hash(hash)?,
            32 * 1024 * 1024 - total,
            &mut 0,
        )?;
        total += bytes.len();
        files.push((path.into(), bytes));
    }
    Ok((version, files, version_id(&model, id, &hash), compressed))
}
fn model_row<'a>(index: &'a Value, id: &str) -> io::Result<&'a Value> {
    let bare = id.split('@').next().unwrap_or(id);
    index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    format!(
                        "{}/{}",
                        row["id"]["scope"].as_str().unwrap_or_default(),
                        row["id"]["name"].as_str().unwrap_or_default(),
                    ) == bare
                })
        })
        .ok_or_else(|| missing(id))
}
pub(super) fn http(items: &[ObjectItem], id: &str) -> io::Result<Captured> {
    let (objects, model) = shared::decode(items, id)?;
    validate_sources(&objects)?;
    let model = model.ok_or_else(|| missing(id))?;
    let hash = shared::version_hash(&model, id)?;
    let (kind, bytes) = objects.get(&hash).ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(unsupported("fork remote version type"));
    }
    let version: Value = serde_json::from_slice(bytes)?;
    let mut files = Vec::new();
    for row in source_rows(&version)? {
        let (path, hash) = source(row)?;
        let (kind, bytes) = objects.get(hash).ok_or_else(|| missing(id))?;
        if kind != "Source" {
            return Err(unsupported("fork remote source type"));
        }
        files.push((path.into(), bytes.clone()));
    }
    Ok((
        version,
        files,
        version_id(&model, id, &hash),
        items
            .iter()
            .map(|item| (item.hash.clone(), item.compressed.clone()))
            .collect(),
    ))
}
fn source_rows(version: &Value) -> io::Result<&[Value]> {
    let files =
        version["files"].as_array().ok_or_else(|| unsupported("fork remote source files"))?;
    if files.len() > 16384 {
        return Err(unsupported("fork remote source count"));
    }
    let mut paths = std::collections::HashSet::new();
    for row in files {
        let (path, _) = source(row)?;
        if !paths.insert(path) {
            return Err(unsupported("fork duplicate remote source path"));
        }
    }
    Ok(files)
}
fn source(row: &Value) -> io::Result<(&str, &str)> {
    let path =
        row["relativePath"].as_str().ok_or_else(|| unsupported("fork remote source path"))?;
    if path.is_empty()
        || Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(unsupported("fork unsafe remote source path"));
    }
    Ok((path, row["file"].as_str().ok_or_else(|| unsupported("fork remote source hash"))?))
}
fn retain(scope: &Path, hash: &str, observed: &mut Observed) -> io::Result<Vec<u8>> {
    crate::merge_history::hash(hash)?;
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    observed.ancestors(
        scope,
        path.parent().ok_or_else(|| unsupported("fork remote object parent"))?,
    )?;
    required(observed, &path)
}
fn version_id(model: &Value, id: &str, hash: &str) -> String {
    if let Some((_, version)) = id.rsplit_once('@')
        && version != "latest"
    {
        return version.into();
    }
    model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .find(|(_, value)| value.as_str() == Some(hash))
                .map(|(tag, _)| tag.clone())
        })
        .unwrap_or_else(|| hash.into())
}
pub(super) fn configs(version: &Value) -> io::Result<Value> {
    let mut configs = json!({});
    for entry in
        version["extensions"].as_array().ok_or_else(|| unsupported("fork remote extensions"))?
    {
        let name = entry["name"]
            .as_str()
            .or_else(|| entry["extensionId"].as_str())
            .map(str::to_owned)
            .or_else(|| {
                let id = &entry["extensionId"];
                let name = id["name"].as_str()?;
                let scope = id["scope"]
                    .as_str()
                    .filter(|scope| !scope.is_empty())?;
                Some(
                    id["version"]
                        .as_str()
                        .filter(|ver| !ver.is_empty())
                        .map_or_else(
                            || format!("{scope}/{name}"),
                            |version| format!("{scope}/{name}@{version}"),
                        ),
                )
            })
            .ok_or_else(|| unsupported("fork remote extension identity"))?;
        if let Some(config) = entry.get("config") {
            configs[&name] = config.clone();
        }
    }
    Ok(configs)
}
fn missing(id: &str) -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, format!(r#"error: component "{id}" was not found"#))
}

fn validate_sources(objects: &shared::Objects) -> io::Result<()> {
    use sha1::{Digest, Sha1};
    for (hash, (kind, bytes)) in objects {
        if kind == "Source" && crate::validate::hexadecimal(&Sha1::digest(bytes)) != *hash {
            return Err(unsupported("fork remote Source identity differs"));
        }
    }
    Ok(())
}

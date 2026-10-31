use crate::{
    checkout::repository,
    component_recover::batch::{invalid, unsupported},
};
use bit_client_transfer::tar::ObjectItem;
use serde_json::Value;
use std::{collections::HashMap, io, path::Path};

pub(super) fn file(scope: &Path, id: &str) -> io::Result<bool> {
    let index: Value = serde_json::from_slice(
        &crate::read_budget::Budget::new(32 * 1024 * 1024)
            .read(std::fs::File::open(scope.join("index.json"))?)?,
    )?;
    let bare = id.split('@').next().unwrap_or(id);
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("recovery remote scope index"))?;
    let row = rows
        .iter()
        .find(|row| {
            format!(
                "{}/{}",
                row["id"]["scope"].as_str().unwrap_or_default(),
                row["id"]["name"].as_str().unwrap_or_default(),
            ) == bare
        })
        .ok_or_else(|| missing(id))?;
    let (_, model) = crate::read_scope_object(
        scope,
        row["hash"].as_str().ok_or_else(|| invalid("recovery remote Component hash"))?,
    )?
    .ok_or_else(|| missing(id))?;
    let hash = version_hash(&model, id)?;
    let (kind, version) = crate::read_scope_object(scope, &hash)?.ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(invalid("recovery remote Version type"));
    }
    validate_file_sources(scope, &version)?;
    Ok(removed(&model, &version, &hash))
}
fn validate_file_sources(scope: &Path, version: &Value) -> io::Result<()> {
    let mut total = 0;
    for file in
        version["files"].as_array().ok_or_else(|| invalid("recovery remote Version sources"))?
    {
        let hash = file["file"].as_str().ok_or_else(|| invalid("recovery remote Source hash"))?;
        let bytes = repository::source(
            &scope.join("objects"),
            crate::merge_history::hash(hash)?,
            32 * 1024 * 1024 - total,
            &mut 0,
        )?;
        total += bytes.len();
    }
    Ok(())
}
pub(super) fn http(items: &[ObjectItem], id: &str) -> io::Result<bool> {
    let (objects, model) = decode(items, id)?;
    let model = model.ok_or_else(|| missing(id))?;
    let hash = version_hash(&model, id)?;
    let (kind, body) = objects.get(&hash).ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(invalid("recovery remote Version type"));
    }
    let version: Value = serde_json::from_slice(body)?;
    for file in
        version["files"].as_array().ok_or_else(|| invalid("recovery remote Version sources"))?
    {
        let hash = file["file"].as_str().ok_or_else(|| invalid("recovery remote Source hash"))?;
        if objects
            .get(hash)
            .is_none_or(|(kind, _)| kind != "Source")
        {
            return Err(missing(id));
        }
    }
    Ok(removed(&model, &version, &hash))
}
pub(crate) type Objects = HashMap<String, (String, Vec<u8>)>;
pub(crate) fn decode(items: &[ObjectItem], id: &str) -> io::Result<(Objects, Option<Value>)> {
    let mut objects = HashMap::new();
    let mut model = None;
    let mut total = 0;
    for item in items {
        let raw = repository::inflate(&item.compressed, 32 * 1024 * 1024)?;
        total += raw.len();
        if total > 128 * 1024 * 1024 {
            return Err(unsupported("recovery remote inflated object budget"));
        }
        let kind = raw
            .split(|byte| *byte == b' ')
            .next()
            .and_then(|bytes| std::str::from_utf8(bytes).ok())
            .ok_or_else(|| invalid("recovery remote object header"))?
            .to_owned();
        let (_, body) = repository::split(&raw, crate::merge_history::hash(&item.hash)?, &kind)?;
        if kind == "Component"
            && let Some(value) = matching_model(body, id)?
        {
            model = Some(value);
        }
        if objects
            .insert(item.hash.clone(), (kind, body.to_vec()))
            .is_some()
        {
            return Err(invalid("duplicate recovery remote object"));
        }
    }
    Ok((objects, model))
}
fn matching_model(body: &[u8], id: &str) -> io::Result<Option<Value>> {
    let value: Value = serde_json::from_slice(body)?;
    let identity = format!(
        "{}/{}",
        value["scope"].as_str().unwrap_or_default(),
        value["name"].as_str().unwrap_or_default(),
    );
    Ok((identity == id.split('@').next().unwrap_or(id)).then_some(value))
}
pub(crate) fn version_hash(model: &Value, id: &str) -> io::Result<String> {
    let version = id
        .rsplit_once('@')
        .map(|(_, version)| version)
        .filter(|version| *version != "latest");
    let hash = version
        .map(|version| model["versions"][version].as_str().unwrap_or(version))
        .or_else(|| model["head"].as_str());
    let hash = hash.ok_or_else(|| {
        invalid(format!("unable to find the component {id} in the current lane or main"))
    })?;
    crate::merge_history::hash(hash)?;
    Ok(hash.into())
}
fn removed(model: &Value, version: &Value, hash: &str) -> bool {
    let config = super::super::batch::repository::removal(version);
    if config["removed"] == true {
        return true;
    }
    if config["snaps"]
        .as_array()
        .is_some_and(|snaps| snaps.iter().any(|snap| snap == hash))
    {
        return true;
    }
    let tag = model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .find(|(_, reference)| reference.as_str() == Some(hash))
        })
        .map(|(tag, _)| tag);
    let range = config["range"]
        .as_str()
        .and_then(|range| node_semver::Range::parse(range).ok());
    tag.and_then(|tag| node_semver::Version::parse(tag).ok())
        .zip(range)
        .is_some_and(|(tag, range)| range.satisfies(&tag))
}
fn missing(id: &str) -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, format!("component {id} was not found"))
}

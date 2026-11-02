//! File-scope ([`file`]) and HTTP-tar `Component` and `Version` object inspection for remote recovery probes.

use crate::{
    checkout::repository,
    component_recover::batch::{invalid, unsupported},
};
use bit_client_transfer::tar::ObjectItem;
use serde_json::Value;
use std::{collections::HashMap, io, path::Path};

/// Inspects a file-based remote `scope` to determine whether component `id` is soft-deleted.
pub(super) fn file(scope: &Path, id: &str) -> io::Result<bool> {
    let id = id.trim();
    let bare = id
        .split('@')
        .next()
        .unwrap_or(id)
        .trim();
    let model = read_remote_model(scope, bare, id)?;
    let hash = version_hash(&model, id)?;
    let (kind, version) = crate::read_scope_object(scope, &hash)?.ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(invalid("recovery remote Version type"));
    }
    validate_file_sources(scope, &version)?;
    Ok(removed(&model, &version, &hash))
}

/// Read the `Component` model object for `bare` from a file-based remote `scope`.
fn read_remote_model(scope: &Path, bare: &str, id: &str) -> io::Result<Value> {
    use sha1::{Digest, Sha1};
    let (target_scope, target_name) = bare
        .split_once('/')
        .unwrap_or(("", bare));
    if let Some(model) = read_indexed_remote_model(scope, target_scope, target_name, id)? {
        return Ok(model);
    }
    for candidate in [bare, target_name] {
        let comp_hash = crate::validate::hexadecimal(&Sha1::digest(candidate.as_bytes()));
        if let Some((kind, model)) = crate::read_scope_object(scope, &comp_hash)?
            && kind == "Component"
        {
            return Ok(model);
        }
    }
    Err(missing(id))
}

/// Look up a `Component` model object in `scope/index.json` matching `(target_scope, target_name)`.
fn read_indexed_remote_model(
    scope: &Path,
    target_scope: &str,
    target_name: &str,
    id: &str,
) -> io::Result<Option<Value>> {
    let Ok(file) = std::fs::File::open(scope.join("index.json")) else {
        return Ok(None);
    };
    let index: Value =
        crate::parse_jsonc(&crate::read_budget::Budget::new(32 * 1024 * 1024).read(file)?)?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("recovery remote scope index"))?;
    let Some(row) = rows
        .iter()
        .find(|row| {
            let (row_scope, row_name) = super::super::batch::repository::row_id_parts(&row["id"]);
            row["isSymlink"] != true
                && row_name == target_name
                && (row_scope == target_scope || row_scope.is_empty())
        })
    else {
        return Ok(None);
    };
    let comp_hash = row["hash"]
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("recovery remote Component hash"))?;
    let (_, model) = crate::read_scope_object(scope, comp_hash)?.ok_or_else(|| missing(id))?;
    Ok(Some(model))
}
/// Validate that all `Source` objects referenced by `version["files"]` exist in `scope/objects` via [`repository::source`] within the 32 MiB budget.
fn validate_file_sources(scope: &Path, version: &Value) -> io::Result<()> {
    let objects_dir = scope.join("objects");
    let mut total = 0;
    for file in version["files"]
        .as_array()
        .filter(|files| files.len() <= 4096)
        .ok_or_else(|| invalid("recovery remote Version sources"))?
    {
        let hash = file["file"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("recovery remote Source hash"))?;
        let bytes = repository::source(
            &objects_dir,
            crate::merge_history::hash(hash)?,
            32 * 1024 * 1024 - total,
            &mut 0,
        )?;
        total += bytes.len();
    }
    Ok(())
}
/// Inspect an HTTP-fetched tar [`ObjectItem`] slice to determine whether component `id` is soft-deleted.
pub(super) fn http(items: &[ObjectItem], id: &str) -> io::Result<bool> {
    let (objects, model) = decode(items, id)?;
    let model = model.ok_or_else(|| missing(id))?;
    let hash = version_hash(&model, id)?;
    let (kind, body) = objects.get(&hash).ok_or_else(|| missing(id))?;
    if kind != "Version" {
        return Err(invalid("recovery remote Version type"));
    }
    let version: Value = crate::parse_jsonc(body)?;
    for file in version["files"]
        .as_array()
        .filter(|files| files.len() <= 4096)
        .ok_or_else(|| invalid("recovery remote Version sources"))?
    {
        let hash = file["file"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("recovery remote Source hash"))?;
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
    let mut objects = HashMap::with_capacity(items.len());
    let mut model = None;
    let mut total = 0;
    for item in items {
        let mut raw = repository::inflate(&item.compressed, 32 * 1024 * 1024)?;
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
        let header_len = raw.len() - body.len();
        raw.drain(..header_len);
        if objects
            .insert(item.hash.clone(), (kind, raw))
            .is_some()
        {
            return Err(invalid("duplicate recovery remote object"));
        }
    }
    Ok((objects, model))
}
#[inline]
fn matching_model(body: &[u8], id: &str) -> io::Result<Option<Value>> {
    let value: Value = crate::parse_jsonc(body)?;
    let id = id.trim();
    let bare = id
        .split('@')
        .next()
        .unwrap_or(id)
        .trim();
    let (target_scope, target_name) = bare
        .split_once('/')
        .map_or(("", bare), |(scope, name)| (scope.trim(), name.trim()));
    let model_scope = value["scope"].as_str().map_or("", str::trim);
    let matches = value["name"].as_str().map(str::trim) == Some(target_name)
        && (model_scope == target_scope || model_scope.is_empty());
    Ok(matches.then_some(value))
}
pub(crate) fn version_hash(model: &Value, id: &str) -> io::Result<String> {
    let version = id
        .trim()
        .rsplit_once('@')
        .map(|(_, version)| version.trim())
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"));
    let hash = version
        .map(|version| {
            model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .unwrap_or(version)
        })
        .or_else(|| {
            model["head"]
                .as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
        });
    let hash = hash.ok_or_else(|| {
        invalid(format!("unable to find the component {id} in the current lane or main"))
    })?;
    crate::merge_history::hash(hash)?;
    Ok(hash.into())
}
fn removed(model: &Value, version: &Value, hash: &str) -> bool {
    let hash = hash.trim();
    let config = super::super::batch::repository::removal(version);
    if config["removed"] == true {
        return true;
    }
    if config["snaps"]
        .as_array()
        .is_some_and(|snaps| {
            snaps
                .iter()
                .any(|snap| snap.as_str().map(str::trim) == Some(hash))
        })
    {
        return true;
    }
    let Some(tag_ver) = model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(|versions| versions.iter())
        .find(|(_, reference)| reference.as_str().map(str::trim) == Some(hash))
        .and_then(|(tag, _)| node_semver::Version::parse(tag.trim()).ok())
    else {
        return false;
    };
    config["range"]
        .as_str()
        .and_then(|range| node_semver::Range::parse(range.trim()).ok())
        .is_some_and(|range| range.satisfies(&tag_ver))
}
#[inline]
fn missing(id: &str) -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, format!("component {id} was not found"))
}

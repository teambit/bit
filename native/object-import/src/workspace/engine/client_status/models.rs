//! Stored model file reference resolution and hashing for client status targets.

use super::{Target, invalid};
use crate::{checkout::repository, merge_history, read_version};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn files(root: &Path, target: &Target) -> io::Result<Value> {
    if target.version.is_empty() {
        return Ok(json!([]));
    }
    let scope = crate::scope_path(root);
    let directory = scope.join("objects");
    let Some(model) = read_component(&scope, &directory, &target.id)? else {
        return Ok(json!([]));
    };
    if !crate::workspace::engine::status_models::comparison::model_matches_identity(
        &model, &target.id,
    ) {
        return Err(invalid("status Component identity"));
    }
    let reference = reference(&model, target)?;
    let version = read_version::Reader::query(&directory)?.read(reference)?;
    let files = version["files"].as_array().ok_or_else(|| invalid("status Version files"))?;
    if files.len() > 4096 {
        return Err(invalid("status model file count"));
    }
    Ok(Value::Array(
        files
            .iter()
            .map(|file| json!({"relativePath":file["relativePath"],"hash":file["file"]}))
            .collect(),
    ))
}

fn read_component(scope: &Path, directory: &Path, id: &str) -> io::Result<Option<Value>> {
    let bare_name = id.split_once('/').map_or(id, |(_, name)| name);
    let candidates = index_component_hash(scope, id)
        .into_iter()
        .chain([Sha1::digest(id.as_bytes()).into(), Sha1::digest(bare_name.as_bytes()).into()]);
    for hash in candidates {
        let mut compressed = 0;
        let object = match repository::read(directory, hash, 32 * 1024 * 1024, &mut compressed) {
            Ok(object) => object,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        let (size, body) = repository::split(&object, hash, "Component")?;
        if size
            .parse::<usize>()
            .ok()
            .is_none_or(|len| len > 32 * 1024 * 1024)
        {
            return Err(invalid("status Component header"));
        }
        return serde_json::from_slice(body).map(Some).map_err(io::Error::other);
    }
    Ok(None)
}

fn index_component_hash(scope: &Path, id: &str) -> Option<[u8; 20]> {
    let index_path = scope.join("index.json");
    let meta = std::fs::symlink_metadata(&index_path).ok()?;
    if !meta.is_file() || meta.len() > 16 * 1024 * 1024 {
        return None;
    }
    let bytes = std::fs::read(index_path).ok()?;
    let document = crate::recovery::jsonc::parse(&bytes).ok()?;
    let rows = document
        .as_array()
        .or_else(|| document["components"].as_array())?;
    let id = id.trim();
    let (target_scope, target_name) = id.split_once('/').unwrap_or(("", id));
    rows.iter()
        .find(|row| {
            row["type"].as_str().unwrap_or("Component") == "Component"
                && row["isSymlink"] != true
                && {
                    let (entry_scope, entry_name) = index_row_parts(row);
                    entry_name == target_name
                        && (entry_scope == target_scope || entry_scope.is_empty())
                }
        })
        .and_then(|row| row["hash"].as_str())
        .and_then(|hash| merge_history::hash(hash.trim()).ok())
}

#[inline]
fn index_row_parts(row: &Value) -> (&str, &str) {
    if let Some(id_str) = row["id"].as_str().map(str::trim) {
        let bare = id_str.rsplit_once('@').map_or(id_str, |(base, _)| base.trim());
        let (scope, name) = bare
            .split_once('/')
            .unwrap_or(("", bare));
        (scope.trim(), name.trim())
    } else {
        let raw_name = row["id"]["name"].as_str().map_or("", str::trim);
        (
            row["id"]["scope"].as_str().map_or("", str::trim),
            raw_name.rsplit_once('@').map_or(raw_name, |(base, _)| base.trim()),
        )
    }
}

#[inline]
fn reference<'a>(model: &'a Value, target: &'a Target) -> io::Result<&'a str> {
    let version = target.version.trim();
    let reference = if matches!(version, "" | "latest" | "head") {
        model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("status unknown version"))?
    } else if merge_history::hash(version).is_ok() {
        version
    } else {
        model["orphanedVersions"]
            .get(version)
            .unwrap_or_else(|| &model["versions"][version])
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
            .ok_or_else(|| invalid("status unknown version"))?
    };
    Ok(reference)
}

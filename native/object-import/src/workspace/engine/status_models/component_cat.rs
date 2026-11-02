//! `CatCmd`'s stored `Version` and `Source` [`read`] for [`Request`], without a Node round trip.

use super::{indexed_models, invalid};
use crate::{checkout::repository, merge_history, read_budget::Budget, read_version};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

/// Wire request for inspecting a stored `ModelComponent`, `Version`, or `Source` object via `cat-component`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    stored_identity: String,
    version: String,
}

/// Reads the stored `Version` and `Source` file entries for `request` from the local scope.
pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    let stored_identity = request.stored_identity.trim();
    if stored_identity.is_empty() {
        return Err(invalid("cat component model absent"));
    }
    let directory = crate::scope_path(&request.root).join("objects");
    let reader = super::Reader {
        directory: &directory,
        overlay: None,
        raw: Budget::new(32 * 1024 * 1024),
        packed: Budget::new(32 * 1024 * 1024),
    };
    let models = indexed_models(&reader, &request.root, pool)?;
    let model = models
        .iter()
        .find(|model| super::comparison::model_matches_identity(model, stored_identity))
        .ok_or_else(|| invalid("cat component model absent"))?;
    let reference = reference(model, &request.version)?;
    let mut versions = read_version::Reader::query(&directory)?;
    let version = versions.read(&reference)?;
    let files = files(&directory, &version)?;
    let count = files.len();
    Ok((count, json!({"version":request.version.trim(),"files":files})))
}

/// Resolves `version` (`""`, `"latest"`, `"head"`, SHA-1, or tag) on `model` to a lowercase hex SHA-1.
#[inline]
fn reference(model: &Value, version: &str) -> io::Result<String> {
    let version = version.trim();
    if matches!(version, "" | "latest" | "head") {
        let head = model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("cat version absent"))?;
        return Ok(crate::validate::hexadecimal(&merge_history::hash(head)?));
    }
    if let Ok(raw) = merge_history::hash(version) {
        return Ok(crate::validate::hexadecimal(&raw));
    }
    let reference = model["versions"]
        .get(version)
        .or_else(|| model["orphanedVersions"].get(version))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|reference| !reference.is_empty())
        .ok_or_else(|| invalid("cat version absent"))?;
    Ok(crate::validate::hexadecimal(&merge_history::hash(reference)?))
}

/// Reads and decodes all `Source` file blobs referenced by `version["files"]` under `directory`.
/// Enforces a 4,096-file count limit and 8 MiB raw/packed read budgets.
#[inline]
fn files(directory: &std::path::Path, version: &Value) -> io::Result<Vec<Value>> {
    let rows = version["files"].as_array().ok_or_else(|| invalid("cat Version files"))?;
    if rows.len() > 4096 {
        return Err(invalid("cat file count"));
    }
    let raw = Budget::new(8 * 1024 * 1024);
    let packed = Budget::new(8 * 1024 * 1024);
    rows.iter()
        .map(|row| {
            let path = row["relativePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| invalid("cat file path"))?;
            let hash = row["file"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("cat file Source"))?;
            let source = repository::read_source_shared(
                directory,
                merge_history::hash(hash)?,
                &raw,
                &packed,
            )?;
            Ok(json!({"path":path,"content":String::from_utf8_lossy(&source.body)}))
        })
        .collect()
}

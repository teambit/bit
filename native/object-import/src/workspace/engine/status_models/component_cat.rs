//! `CatCmd`'s stored Version and Source reads, without a Node file-body round trip.

use super::{indexed_models, invalid};
use crate::{checkout::repository, merge_history, read_budget::Budget, read_version};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    stored_identity: String,
    version: String,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
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
        .find(|model| super::comparison::model_matches_identity(model, &request.stored_identity))
        .ok_or_else(|| invalid("cat component model absent"))?;
    let reference = reference(model, &request.version)?;
    let mut versions = read_version::Reader::query(&directory)?;
    let version = versions.read(&reference)?;
    let files = files(&directory, &version)?;
    let count = files.len();
    Ok((count, json!({"version":request.version,"files":files})))
}

fn reference(model: &Value, version: &str) -> io::Result<String> {
    if matches!(version, "" | "latest" | "head") {
        let head = model["head"].as_str().ok_or_else(|| invalid("cat version absent"))?;
        merge_history::hash(head)?;
        return Ok(head.to_owned());
    }
    if merge_history::hash(version).is_ok() {
        return Ok(version.to_owned());
    }
    let reference = model["orphanedVersions"]
        .get(version)
        .or_else(|| model["versions"].get(version))
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("cat version absent"))?;
    merge_history::hash(reference)?;
    Ok(reference.to_owned())
}

fn files(directory: &std::path::Path, version: &Value) -> io::Result<Vec<Value>> {
    let rows = version["files"].as_array().ok_or_else(|| invalid("cat Version files"))?;
    if rows.len() > 4096 {
        return Err(invalid("cat file count"));
    }
    let raw = Budget::new(8 * 1024 * 1024);
    let packed = Budget::new(8 * 1024 * 1024);
    rows.iter()
        .map(|row| {
            let path = row["relativePath"].as_str().ok_or_else(|| invalid("cat file path"))?;
            let hash = row["file"].as_str().ok_or_else(|| invalid("cat file Source"))?;
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

use super::{Target, invalid};
use crate::{checkout::repository, merge_history, read_version};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn files(root: &Path, target: &Target) -> io::Result<Value> {
    if target.version.is_empty() {
        return Ok(json!([]));
    }
    let directory = crate::scope_path(root).join("objects");
    let hash = Sha1::digest(target.id.as_bytes()).into();
    let mut compressed = 0;
    let object = match repository::read(&directory, hash, 32 * 1024 * 1024, &mut compressed) {
        Ok(object) => object,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(json!([])),
        Err(error) => return Err(error),
    };
    let (size, body) = repository::split(&object, hash, "Component")?;
    if size.parse::<usize>().is_err() {
        return Err(invalid("status Component header"));
    }
    let model: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
    if format!(
        "{}/{}",
        model["scope"].as_str().unwrap_or_default(),
        model["name"].as_str().unwrap_or_default(),
    ) != target.id
    {
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

fn reference<'a>(model: &'a Value, target: &'a Target) -> io::Result<&'a str> {
    let reference = if merge_history::hash(&target.version).is_ok() {
        target.version.as_str()
    } else {
        model["orphanedVersions"]
            .get(&target.version)
            .unwrap_or_else(|| &model["versions"][&target.version])
            .as_str()
            .ok_or_else(|| invalid("status unknown version"))?
    };
    Ok(reference)
}

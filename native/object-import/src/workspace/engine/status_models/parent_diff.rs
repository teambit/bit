//! The first-parent chain used by `bit diff --parent`, with tags and file identity.

use super::{Request as ModelsRequest, invalid, load, versions};
use crate::{merge_history, read_version};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    identity: String,
    target_version: String,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let model = model(request, pool)?;
    let target_ref = versions::reference(&model, &request.target_version)?;
    let tags = tags(&model)?;
    let directory = request.root.join(".bit/objects");
    let mut reader = read_version::Reader::query(&directory)?;
    let target = reader.read(&target_ref)?;
    let mut parent = first_parent(&target)?;
    let mut seen = HashSet::from([target_ref]);
    let mut rows = Vec::new();
    while let Some(reference) = parent {
        if !seen.insert(reference.clone()) || rows.len() >= 4096 {
            return Err(invalid("version parent chain cycle or limit"));
        }
        let version = reader.read(&reference)?;
        rows.push(json!({
            "reference":reference,
            "tag":tags.get(&reference),
            "hidden":version["hidden"] == true,
            "sameFiles":same_files(&version, &target)?,
        }));
        parent = first_parent(&version)?;
    }
    Ok((rows.len(), json!({"parents":rows})))
}

fn model(request: &Request, pool: &ThreadPool) -> io::Result<Value> {
    let snapshot = load(
        &ModelsRequest {
            root: request.root.clone(),
            targets: Vec::new(),
            history: false,
            include_heads: false,
            stage_history: false,
            current_lane_id: None,
        },
        pool,
        false,
    )?;
    snapshot.models
        .into_iter()
        .find(|model| {
            let scope = model["scope"].as_str().unwrap_or_default();
            let name = model["name"].as_str().unwrap_or_default();
            format!("{scope}/{name}") == request.identity
        })
        .ok_or_else(|| invalid("version parent model absent"))
}

fn tags(model: &Value) -> io::Result<HashMap<String, String>> {
    let mut tags = HashMap::new();
    for (tag, reference) in
        model["versions"].as_object().ok_or_else(|| invalid("version parent tags"))?
    {
        let reference = reference.as_str().ok_or_else(|| invalid("version parent tag ref"))?;
        merge_history::hash(reference)?;
        tags.entry(reference.to_string()).or_insert_with(|| tag.clone());
    }
    Ok(tags)
}

fn first_parent(version: &Value) -> io::Result<Option<String>> {
    let Some(parents) = version
        .get("parents")
        .filter(|value| !value.is_null())
    else {
        return Ok(None);
    };
    let parents = parents.as_array().ok_or_else(|| invalid("version parent refs"))?;
    parents
        .first()
        .map(|parent| {
            let reference = parent.as_str().ok_or_else(|| invalid("version parent ref"))?;
            merge_history::hash(reference)?;
            Ok(reference.to_string())
        })
        .transpose()
}

fn same_files(left: &Value, right: &Value) -> io::Result<bool> {
    fn entries(version: &Value) -> io::Result<Vec<String>> {
        let files = version["files"].as_array().ok_or_else(|| invalid("version parent files"))?;
        let mut entries = files
            .iter()
            .map(|file| {
                let path =
                    file["relativePath"].as_str().ok_or_else(|| invalid("version parent path"))?;
                let hash =
                    file["file"].as_str().ok_or_else(|| invalid("version parent file ref"))?;
                merge_history::hash(hash)?;
                Ok(format!("{path}:{hash}"))
            })
            .collect::<io::Result<Vec<_>>>()?;
        entries.sort();
        Ok(entries)
    }
    Ok(entries(left)? == entries(right)?)
}

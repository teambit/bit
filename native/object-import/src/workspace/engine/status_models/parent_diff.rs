//! The first-parent chain used by `bit diff --parent`, with tags and file identity.

use super::{Request as ModelsRequest, invalid, load_overlay, versions};
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
    #[serde(default)]
    pub(in crate::workspace::engine) import_token: Option<String>,
    root: PathBuf,
    identity: String,
    target_version: String,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    read_overlay(request, pool, None)
}

pub(in crate::workspace::engine) fn read_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<(usize, Value)> {
    let model = model(request, pool, overlay)?;
    let target_ref = versions::reference(&model, &request.target_version)?;
    let tags = tags(&model)?;
    let directory = crate::scope_path(&request.root).join("objects");
    let mut reader = read_version::Reader::query(&directory)?;
    let target = read_version(&mut reader, overlay, &target_ref)?;
    let mut parent = first_parent(&target)?;
    let mut seen = HashSet::from([target_ref]);
    let mut rows = Vec::new();
    while let Some(reference) = parent {
        if !seen.insert(reference.clone()) || rows.len() >= 4096 {
            return Err(invalid("version parent chain cycle or limit"));
        }
        let version = read_version(&mut reader, overlay, &reference)?;
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

fn model(
    request: &Request,
    pool: &ThreadPool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    let snapshot = load_overlay(
        &ModelsRequest {
            root: request.root.clone(),
            targets: Vec::new(),
            history: false,
            include_heads: false,
            stage_history: false,
            history_targets_only: false,
            current_lane_id: None,
        },
        pool,
        false,
        overlay,
    )?;
    let target_identity = request.identity.trim();
    snapshot.models
        .into_iter()
        .find(|model| super::comparison::model_id(model) == target_identity)
        .ok_or_else(|| invalid("version parent model absent"))
}

fn tags(model: &Value) -> io::Result<HashMap<String, String>> {
    if ["versions", "orphanedVersions"]
        .into_iter()
        .any(|field| {
            model
                .get(field)
                .is_some_and(|val| !val.is_null() && !val.is_object())
        })
    {
        return Err(invalid("version parent tags"));
    }
    let mut tags = HashMap::new();
    for (tag, reference) in model["versions"]
        .as_object()
        .into_iter()
        .flatten()
    {
        let reference = reference
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("version parent tag ref"))?;
        merge_history::hash(reference)?;
        tags.entry(reference.to_string())
            .or_insert_with(|| tag.trim().to_owned());
    }
    for (tag, reference) in model["orphanedVersions"]
        .as_object()
        .into_iter()
        .flatten()
    {
        if let Some(reference) = reference.as_str().map(str::trim)
            && merge_history::hash(reference).is_ok()
        {
            tags.entry(reference.to_string())
                .or_insert_with(|| tag.trim().to_owned());
        }
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
            let reference = parent
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("version parent ref"))?;
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
                let path = file["relativePath"]
                    .as_str()
                    .map(str::trim)
                    .filter(|path| !path.is_empty())
                    .ok_or_else(|| invalid("version parent path"))?;
                let hash = file["file"]
                    .as_str()
                    .map(str::trim)
                    .ok_or_else(|| invalid("version parent file ref"))?;
                merge_history::hash(hash)?;
                Ok(format!("{path}:{hash}"))
            })
            .collect::<io::Result<Vec<_>>>()?;
        entries.sort();
        Ok(entries)
    }
    Ok(entries(left)? == entries(right)?)
}

fn read_version(
    reader: &mut crate::read_version::Reader<'_>,
    overlay: Option<&crate::command_import::Overlay>,
    reference: &str,
) -> io::Result<Value> {
    if let Some(value) = overlay
        .map(|overlay| overlay.read(reference, "Version"))
        .transpose()?
        .flatten()
    {
        crate::history_query::validate_version(value)?;
        return Ok(value.clone());
    }
    reader.read(reference)
}

//! Publish the independent bitmap-auto-sync startup lifecycle.

use super::super::{State, bitmap, repository::Repository};
use crate::workspace::engine::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    token: String,
    git_head: String,
    bitmap_history_file_id: String,
    ids: Vec<String>,
}

pub(in crate::workspace::engine) fn finalize(
    input: &Request,
    state: &State,
) -> io::Result<(usize, Value)> {
    bitmap::validate_history_file_id(&input.bitmap_history_file_id)?;
    let retained = state.inbound.as_ref().ok_or_else(|| invalid("auto-sync inbound missing"))?;
    if retained.token != input.token {
        return Err(invalid("auto-sync inbound token"));
    }
    let mut repository = Repository::new(&input.root, None);
    let mut updates = Vec::new();
    for id in &input.ids {
        let model = match retained.import.overlay
            .models()
            .into_iter()
            .find(|model| model_matches_id(model, id))
        {
            Some(model) => model.clone(),
            None => match read_component_model(&input.root, &mut repository, id)? {
                Some(model) => model,
                None => continue,
            },
        };
        if let Some(version) = head(&model) {
            updates.push((id.clone(), version));
        }
    }
    let (bitmap, count) = bitmap::auto_sync(&input.root, &updates)?;
    bitmap.validate()?;
    repository.validate()?;
    retained.import.validate()?;
    retained.import.commit()?;
    bitmap.commit(&input.bitmap_history_file_id, "bitmapAutoSync: reconciled with scope HEAD")?;
    let path = crate::scope_path(&input.root).join("last-pull-sync");
    fs::create_dir_all(path.parent().ok_or_else(|| invalid("auto-sync sentinel parent"))?)?;
    fs::write(path, &input.git_head)?;
    Ok((count, json!({"synced":count})))
}

fn model_matches_id(model: &Value, id: &str) -> bool {
    let model_scope = model["scope"].as_str().unwrap_or_default();
    let model_name = model["name"].as_str().unwrap_or_default();
    if let Some((scope, name)) = id.split_once('/') {
        (model_scope == scope || model_scope.is_empty()) && model_name == name
    } else {
        model_name == id
    }
}

fn read_component_model(
    root: &Path,
    repository: &mut Repository,
    id: &str,
) -> io::Result<Option<Value>> {
    let mut candidates = Vec::new();
    if let Some(indexed) = indexed_component_hash(root, id) {
        candidates.push(indexed);
    }
    candidates.push(hash(id.as_bytes()));
    if let Some((_, name)) = id.split_once('/') {
        candidates.push(hash(name.as_bytes()));
    }
    for candidate in candidates {
        match repository.read(&candidate, "Component") {
            Ok(model) => return Ok(Some(model)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn indexed_component_hash(root: &Path, id: &str) -> Option<String> {
    let (scope, name) = id.split_once('/').unwrap_or(("", id));
    let bytes = fs::read(crate::scope_path(root).join("index.json")).ok()?;
    let index: Value = crate::parse_jsonc(&bytes).ok()?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    rows.iter()
        .find(|row| {
            let Some((row_scope_opt, row_name)) = super::remote::file_list::row_id_parts(row)
            else {
                return false;
            };
            let row_scope = row_scope_opt.unwrap_or_default();
            row["isSymlink"] != true
                && row_name == name
                && (row_scope == scope || row_scope.is_empty())
        })
        .and_then(|row| row["hash"].as_str())
        .map(str::to_owned)
}

fn head(model: &Value) -> Option<String> {
    let head = model["head"]
        .as_str()
        .filter(|head| !head.is_empty() && *head != "0")?;
    Some(
        model["versions"]
            .as_object()
            .into_iter()
            .chain(model["orphanedVersions"].as_object())
            .flat_map(|versions| versions.iter().rev())
            .find(|(_, value)| value.as_str() == Some(head))
            .map_or_else(|| head.to_owned(), |(tag, _)| tag.clone()),
    )
}

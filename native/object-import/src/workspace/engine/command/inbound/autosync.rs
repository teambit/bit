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

fn bare_id(id: &str) -> &str {
    let trimmed = id.trim();
    trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim())
}

fn model_matches_id(model: &Value, id: &str) -> bool {
    let model_scope = model["scope"].as_str().map_or("", str::trim);
    let model_name = model["name"].as_str().map_or("", str::trim);
    let bare = bare_id(id);
    if let Some((scope, name)) = bare.split_once('/') {
        (model_scope == scope.trim() || model_scope.is_empty()) && model_name == name.trim()
    } else {
        model_name == bare
    }
}

fn read_component_model(
    root: &Path,
    repository: &mut Repository,
    id: &str,
) -> io::Result<Option<Value>> {
    let bare = bare_id(id);
    let mut candidates = Vec::new();
    if let Some(indexed) = indexed_component_hash(root, bare) {
        candidates.push(indexed);
    }
    candidates.push(hash(bare.as_bytes()));
    if let Some((_, name)) = bare.split_once('/') {
        candidates.push(hash(name.trim().as_bytes()));
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
    let bare = bare_id(id);
    let (scope, name) = bare
        .split_once('/')
        .map_or(("", bare), |(scope, name)| (scope.trim(), name.trim()));
    let index_path = crate::scope_path(root).join("index.json");
    if fs::metadata(&index_path).ok()?.len() > 16 * 1024 * 1024 {
        return None;
    }
    let bytes = fs::read(index_path).ok()?;
    let index: Value = crate::parse_jsonc(&bytes).ok()?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    rows.iter()
        .find(|row| {
            let Some((row_scope_opt, row_name)) = super::remote::file_list::row_id_parts(row)
            else {
                return false;
            };
            let row_scope = row_scope_opt.unwrap_or_default().trim();
            row["isSymlink"] != true
                && row_name.trim() == name
                && (row_scope == scope || row_scope.is_empty())
        })
        .and_then(|row| row["hash"].as_str())
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .map(str::to_owned)
}

fn head(model: &Value) -> Option<String> {
    let head = model["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty() && *head != "0")?;
    Some(
        model["versions"]
            .as_object()
            .into_iter()
            .chain(model["orphanedVersions"].as_object())
            .flat_map(|versions| versions.iter().rev())
            .find(|(_, value)| {
                value
                    .as_str()
                    .is_some_and(|candidate| candidate.trim().eq_ignore_ascii_case(head))
            })
            .map_or_else(|| head.to_owned(), |(tag, _)| tag.clone()),
    )
}

//! Publish the independent `.bitmap` auto-sync startup lifecycle ([`Request`], [`finalize`]).

use super::super::{State, bitmap, repository::Repository};
use crate::workspace::engine::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Deserialized auto-sync finalization request binding the workspace root, git head, and `.bitmap` history ID.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    token: String,
    git_head: String,
    bitmap_history_file_id: String,
    ids: Vec<String>,
}

/// Reconciles `.bitmap` component versions with scope `HEAD` after git pull and writes `last-pull-sync`.
pub(in crate::workspace::engine) fn finalize(
    input: &Request,
    state: &State,
) -> io::Result<(usize, Value)> {
    bitmap::validate_history_file_id(&input.bitmap_history_file_id)?;
    let git_head = validate_git_head(&input.git_head)?;
    let retained = state.inbound.as_ref().ok_or_else(|| invalid("auto-sync inbound missing"))?;
    let token = input.token.trim();
    if token.is_empty() || retained.token != token {
        return Err(invalid("auto-sync inbound token"));
    }
    let mut repository = Repository::new(&input.root, None);
    let overlay_models = retained.import.overlay.models();
    let mut updates = Vec::with_capacity(input.ids.len());
    for id in &input.ids {
        let model = match overlay_models
            .iter()
            .copied()
            .find(|model| model_matches_id(model, id))
        {
            Some(model) => model.clone(),
            None => match read_component_model(&input.root, &mut repository, id)? {
                Some(model) => model,
                None => continue,
            },
        };
        if let Some(version) = head(&model) {
            updates.push((bare_id(id).to_owned(), version));
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
    fs::write(path, git_head)?;
    Ok((count, json!({"synced":count})))
}

/// Validates that `git_head` is a non-empty, non-control revision string within 256 bytes.
fn validate_git_head(git_head: &str) -> io::Result<&str> {
    let git_head = git_head.trim();
    if git_head.is_empty() || git_head.len() > 256 || git_head.chars().any(char::is_control) {
        return Err(invalid("auto-sync git head"));
    }
    Ok(git_head)
}

/// Strips any trailing `@<version>` suffix from `id` and returns the trimmed bare identity.
#[inline]
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
    let mut candidates = Vec::with_capacity(3);
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
    let meta = fs::symlink_metadata(&index_path).ok()?;
    if !meta.is_file() || meta.len() > 16 * 1024 * 1024 {
        return None;
    }
    let index: Value = crate::parse_jsonc(&fs::read(index_path).ok()?).ok()?;
    index["components"]
        .as_array()
        .or_else(|| index.as_array())?
        .iter()
        .find(|row| indexed_row_matches(row, scope, name))
        .and_then(|row| row["hash"].as_str())
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .map(str::to_owned)
}

fn indexed_row_matches(row: &Value, scope: &str, name: &str) -> bool {
    let Some((row_scope_opt, row_name)) = super::remote::file_list::row_id_parts(row) else {
        return false;
    };
    let row_scope = row_scope_opt.unwrap_or_default().trim();
    row["isSymlink"] != true
        && row_name.trim() == name
        && (row_scope == scope || row_scope.is_empty())
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

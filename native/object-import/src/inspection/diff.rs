//! Workspace-versus-model file diff planning ([`plan`], [`Request`], [`validate_request`]) using retained [`super::Plans`] snapshots.

mod read;

use super::{invalid, wire};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};
/// Deserialized `inspectionDiff` request payload against retained workspace file snapshots.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    objects_directory: PathBuf,
    model_files: Vec<wire::Model>,
    git_executable: String,
    color: bool,
}
/// Plans unified file diffs between model `Source` objects and retained workspace file snapshots.
pub(super) fn plan(input: Value, plans: &super::Plans) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    let current =
        plans.get(request.token.trim()).ok_or_else(|| invalid("stale inspection token"))?;
    validate_request(&request)?;
    let total = current
        .iter()
        .map(|file| file.contents.len())
        .fold(0_usize, usize::saturating_add);
    let remaining = super::MAX_BYTES
        .checked_sub(total)
        .ok_or_else(|| invalid("inspection diff path/budget"))?;
    let bodies = read::load(&request.objects_directory, &request.model_files, remaining)?;
    let mut by_path: HashMap<_, _> = current
        .iter()
        .map(|file| (&file.relative_path, file))
        .collect();
    let mut files = Vec::with_capacity(request.model_files.len() + current.len());
    for (model, body) in request.model_files.into_iter().zip(bodies) {
        let right =
            by_path.remove(&model.relative_path).map(|file| file.contents.clone());
        files.push((model.relative_path, Some(body), right));
    }
    if !by_path.is_empty() {
        for file in current.iter() {
            if by_path.contains_key(&file.relative_path) {
                files.push((file.relative_path.clone(), None, Some(file.contents.clone())));
            }
        }
    }
    Ok(
        json!({"files":crate::workspace::engine::diff::frozen(files,request.git_executable.trim(),request.color)?}),
    )
}

/// Validates `objectsDirectory`, `gitExecutable`, and model file paths/hashes on `request`.
fn validate_request(request: &Request) -> io::Result<()> {
    let git_executable = request.git_executable.trim();
    if !request.objects_directory.is_absolute()
        || request.model_files.len() > super::MAX_FILES
        || git_executable.is_empty()
        || git_executable.len() > 4096
        || git_executable.contains('\0')
    {
        return Err(invalid("inspection diff path/budget"));
    }
    crate::merge_history::path(&request.objects_directory)?;
    let mut seen = HashSet::with_capacity(request.model_files.len());
    for model in &request.model_files {
        if model.relative_path.trim() != model.relative_path {
            return Err(invalid("inspection unsafe relative path"));
        }
        super::read::relative(&model.relative_path)?;
        crate::merge_history::hash(model.normalized_hash())?;
        if !seen.insert(model.relative_path.as_str()) {
            return Err(invalid("duplicate inspection diff model path"));
        }
    }
    Ok(())
}

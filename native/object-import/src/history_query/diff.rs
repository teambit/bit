use super::{
    invalid,
    sources::{Cache, Sources},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    pub(super) token: String,
    pub(super) objects_directory: PathBuf,
    relative_path: String,
    left: Option<String>,
    right: Option<String>,
    git_executable: Option<String>,
    color: bool,
    snapshot_directory: Option<PathBuf>,
}
pub(super) fn diff(request: Request, cache: &mut Cache) -> io::Result<Value> {
    crate::merge_history::path(&request.objects_directory)?;
    if request.relative_path.trim().is_empty()
        || request.relative_path.len() > 32768
        || request.relative_path.contains('\0')
    {
        return Err(invalid("history diff path"));
    }
    let mut sources =
        Sources::new(request.objects_directory.clone(), request.snapshot_directory.clone(), cache)?;
    let left = request.left
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .map(|hash| sources.read(hash))
        .transpose()?;
    let right = request.right
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .map(|hash| sources.read(hash))
        .transpose()?;
    let mut result = finish(request, left, right)?;
    sources.response(&mut result);
    Ok(result)
}
fn linux_hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(crate::checkout::eol::normalize(
        bytes.to_vec(),
        false,
    )))
}
fn finish(request: Request, left: Option<Vec<u8>>, right: Option<Vec<u8>>) -> io::Result<Value> {
    let left_hash = left.as_deref().map(linux_hash);
    let right_hash = right.as_deref().map(linux_hash);
    let needs_diff = left.is_some() && right.is_some() && left_hash != right_hash;
    let git_executable = normalized_git_executable(request.git_executable.as_deref());
    let mut response = json!({"files":[],"needsDiff":needs_diff && git_executable.is_none()});
    if let Some(hash) = left_hash {
        response["leftLinuxHash"] = json!(hash);
    }
    if let Some(hash) = right_hash {
        response["rightLinuxHash"] = json!(hash);
    }
    if !needs_diff {
        return Ok(response);
    }
    let Some(git) = git_executable else { return Ok(response) };
    let files = crate::workspace::engine::diff::frozen(
        vec![(request.relative_path, left, right)],
        &git,
        request.color,
    )?;
    response["files"] = json!(
        files
            .into_iter()
            .map(crate::workspace::engine::diff::FileDiff::raw)
            .collect::<Vec<_>>()
    );
    Ok(response)
}

fn normalized_git_executable(git: Option<&str>) -> Option<String> {
    git.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

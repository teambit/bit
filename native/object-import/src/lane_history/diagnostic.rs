//! CI diagnostic check ([`ci_requires_published_diagnostic`]) for `V8` stack preservation on unknown `LaneHistory` keys.
#[cfg(test)]
mod tests;
use crate::command_import::{self, lane::Id};
use serde_json::Value;
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

/// Returns whether CI must delegate before providers to preserve published error stacks.
/// Cached keys and keys proved by an ordinary file remote remain native. HTTP
/// misses are not fetched here: the authoritative command owns its only fetch.
pub fn ci_requires_published_diagnostic(
    root: &Path,
    global_remotes_file: &Path,
    history_id: &str,
) -> io::Result<bool> {
    let history_id = history_id.trim();
    if history_id.is_empty() || history_id.len() > 256 || history_id.contains('\0') {
        return Ok(true);
    }
    let bitmap = document(&root.join(".bitmap"))?;
    let Some(current) = bitmap.get("_bit_lane") else { return Ok(true) };
    let id: Id = command_import::lane::lane_index_id(current)?;
    id.validate()?;
    if id.is_main() {
        return Ok(true);
    }
    let mut imported = command_import::prepare_lane(root, global_remotes_file)?;
    let lane = imported.load_lane(&id)?.ok_or_else(super::invalid)?;
    if local_contains(root, &lane.hash, history_id)? {
        imported.validate()?;
        return Ok(false);
    }
    if lane.is_new || !file_remote(root, global_remotes_file, &id.scope)? {
        imported.validate()?;
        return Ok(true);
    }
    imported.refresh_lane_history(&lane, &id, None)?;
    let history = imported.overlay.read(&super::hash(&lane.hash), "LaneHistory")?;
    let missing = history.is_none_or(|value| value["history"].get(history_id).is_none());
    imported.validate()?;
    Ok(missing)
}

/// Returns `true` when the local `LaneHistory` for `lane_hash` at `root` already contains `history_id`.
#[inline]
fn local_contains(root: &Path, lane_hash: &str, history_id: &str) -> io::Result<bool> {
    match super::read(root, lane_hash) {
        Ok(history) => Ok(history["history"].get(history_id).is_some()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Returns `true` when `scope` resolves to a `file://` remote in local `scope.json` or `global` remotes.
fn file_remote(root: &Path, global: &Path, scope: &str) -> io::Result<bool> {
    let local = document(&crate::scope_path(root).join("scope.json"))?;
    if let Some(host) = local["remotes"]
        .get(scope)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Ok(host
            .strip_prefix("file://")
            .is_some_and(|path| !path.trim().is_empty()));
    }
    let global = match document(global) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(error) => return Err(error),
    };
    let host = global["remotes"]
        .get(scope)
        .unwrap_or_else(|| &global[scope]);
    Ok(host
        .as_str()
        .and_then(|host| host.trim().strip_prefix("file://"))
        .is_some_and(|path| !path.trim().is_empty()))
}

fn document(path: &Path) -> io::Result<Value> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(super::invalid());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    fs::File::open(path)?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        return Err(super::invalid());
    }
    bit_workspace_config::parse_jsonc(&bytes)
}

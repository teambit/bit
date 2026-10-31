//! CI prints released V8 stacks for history errors; prove known keys without effects.
#[cfg(test)]
mod tests;
use crate::command_import::{self, lane::Id};
use serde_json::Value;
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

/// Return whether CI must delegate before providers to preserve published error stacks.
/// Cached keys and keys proved by an ordinary file remote remain native. HTTP
/// misses are not fetched here: the authoritative command owns its only fetch.
pub fn ci_requires_published_diagnostic(
    root: &Path,
    global_remotes_file: &Path,
    history_id: &str,
) -> io::Result<bool> {
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

fn local_contains(root: &Path, lane_hash: &str, history_id: &str) -> io::Result<bool> {
    match super::read(root, lane_hash) {
        Ok(history) => Ok(history["history"].get(history_id).is_some()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn file_remote(root: &Path, global: &Path, scope: &str) -> io::Result<bool> {
    let local = document(&crate::scope_path(root).join("scope.json"))?;
    let global = match document(global) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(error) => return Err(error),
    };
    let host = local["remotes"]
        .get(scope)
        .unwrap_or_else(|| &global[scope]);
    Ok(host
        .as_str()
        .is_some_and(|host| host.starts_with("file://")))
}

fn document(path: &Path) -> io::Result<Value> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(super::invalid());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        return Err(super::invalid());
    }
    bit_workspace_config::parse_jsonc(&bytes)
}

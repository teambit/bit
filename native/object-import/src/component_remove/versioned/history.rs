//! Validate linear lane [`ancestry`] and `Node.js` status-populated `VersionHistory` objects.

#[cfg(all(test, unix))]
mod tests;

use super::{super::validate_ancestors, HistoryState, invalid, outbound};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashSet, fs, io, path::Path};

/// Walks linear `Version` parents from `head` in `objects` to build `VersionHistory` graph entries.
pub(super) fn ancestry(objects: &Path, head: &str) -> io::Result<Vec<Value>> {
    let mut current = crate::validate::hexadecimal(&crate::merge_history::hash(head.trim())?);
    let mut seen = HashSet::new();
    let mut versions = Vec::new();
    loop {
        if !seen.insert(current.clone()) || seen.len() > 32 {
            return Err(invalid("unsupported lane snap ancestry"));
        }
        let version = outbound::read_object(objects, &current, "Version")?;
        let parents = version["parents"].as_array().ok_or_else(|| invalid("lane snap parents"))?;
        if parents.len() > 1 {
            return Err(invalid("merged lane snap ancestry"));
        }
        let Some(parent) = parents.first() else {
            versions.push(json!({"hash":current,"parents":[]}));
            break;
        };
        let raw_next = parent
            .as_str()
            .or_else(|| parent["ref"].as_str())
            .or_else(|| parent["hash"].as_str())
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
            .ok_or_else(|| invalid("lane snap parent"))?;
        let next = crate::validate::hexadecimal(&crate::merge_history::hash(raw_next)?);
        versions.push(json!({"hash":current,"parents":[next]}));
        current = next;
    }
    Ok(versions)
}

/// Prepare the `VersionHistory` [`HistoryState`] verification or creation state for a lane snap removal.
pub(super) fn plan(root: &Path, scope: &str, name: &str, head: &str) -> io::Result<HistoryState> {
    let (scope, name) = (scope.trim(), name.trim());
    let digest = Sha1::new()
        .chain_update(scope.as_bytes())
        .chain_update(b"/")
        .chain_update(name.as_bytes())
        .chain_update(b":VersionHistory")
        .finalize();
    let hash = format!("{digest:x}");
    let objects = crate::scope_path(root).join("objects");
    let path = objects
        .join(&hash[..2])
        .join(&hash[2..]);
    let value = json!({"name":name,"scope":scope,"versions":ancestry(&objects, head.trim())?,"graphCompleteRefs":[]});
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => {
            let before = fs::read(&path)?;
            let existing = outbound::read_object(&objects, &hash, "VersionHistory")?;
            if existing != value {
                return Err(invalid("existing lane VersionHistory differs from snap ancestry"));
            }
            Ok(HistoryState { path, before: Some(before), after: None })
        }
        Ok(_) => Err(invalid("unsupported lane VersionHistory path")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let after = outbound::encode_object(&hash, "VersionHistory", &value)?;
            Ok(HistoryState { path, before: None, after: Some(after) })
        }
        Err(error) => Err(error),
    }
}

/// Verify that the on-disk `VersionHistory` object still matches its captured preimage `state`.
pub(super) fn validate(root: &Path, state: &HistoryState) -> io::Result<()> {
    let parent = state.path.parent().ok_or_else(|| invalid("history path"))?;
    validate_ancestors(root, parent.strip_prefix(root).map_err(|_| invalid("history path"))?)?;
    match &state.before {
        Some(before) => {
            super::regular_file(root, &state.path)?;
            if fs::read(&state.path)? != *before {
                return Err(invalid("lane VersionHistory changed before removal"));
            }
            Ok(())
        }
        None => ensure_absent(&state.path),
    }
}

/// Write the newly encoded `VersionHistory` object when [`HistoryState`]'s `after` payload is present.
#[inline]
pub(super) fn write(state: &HistoryState) -> io::Result<()> {
    if let Some(bytes) = &state.after {
        fs::create_dir_all(state.path.parent().ok_or_else(|| invalid("history path"))?)?;
        fs::write(&state.path, bytes)?;
    }
    Ok(())
}

/// Verify that `path` does not exist on disk before writing a new `VersionHistory` object.
#[inline]
fn ensure_absent(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(invalid("lane VersionHistory appeared before removal")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

impl super::VersionedPlan {
    /// Keep the main-line history that the released CLI's clean-status check publishes.
    pub fn with_status_history(mut self) -> io::Result<Self> {
        let (scope, name) =
            parse_history_identity(&self.workspace.identity, self.workspace.lane.is_some())?;
        if self.workspace.lane.is_some() {
            let version = self.workspace.version
                .as_deref()
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
                .ok_or_else(|| invalid("lane version"))?;
            self.history = Some(plan(&self.workspace.root, scope, name, version)?);
            return Ok(self);
        }
        let (_, model_hash) =
            super::index_change(&self.workspace.root, scope, name, super::RowKind::Staged)?;
        let objects = crate::scope_path(&self.workspace.root).join("objects");
        let model = outbound::read_object(&objects, &model_hash, "Component")?;
        let head = model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("tagged component head"))?;
        let (hash, after) = outbound::prepare_version_history(&objects, scope, name, head)?;
        let path = objects
            .join(&hash[..2])
            .join(&hash[2..]);
        let before = read_history(&self.workspace.root, &path)?;
        self.history = Some(HistoryState { path, before, after: Some(after) });
        Ok(self)
    }
}

#[inline]
fn parse_history_identity(identity: &str, on_lane: bool) -> io::Result<(&str, &str)> {
    identity
        .trim()
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| {
            invalid(if on_lane { "component identity" } else { "tagged component identity" })
        })
}

#[inline]
fn read_history(root: &Path, path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(_) => {
            super::regular_file(root, path)?;
            fs::read(path).map(Some)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

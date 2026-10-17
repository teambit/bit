//! Validate linear lane ancestry and Node's status-populated `VersionHistory`.

use super::{super::validate_ancestors, HistoryState, invalid, outbound};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) fn ancestry(objects: &Path, head: &str) -> io::Result<Vec<Value>> {
    let mut current = head.to_owned();
    let mut seen = HashSet::new();
    let mut versions = Vec::new();
    loop {
        crate::merge_history::hash(&current)?;
        if !seen.insert(current.clone()) || seen.len() > 32 {
            return Err(invalid("unsupported lane snap ancestry"));
        }
        let version = outbound::read_object(objects, &current, "Version")?;
        let parents = version["parents"].as_array().ok_or_else(|| invalid("lane snap parents"))?;
        if parents.len() > 1 {
            return Err(invalid("merged lane snap ancestry"));
        }
        versions.push(json!({"hash":current,"parents":parents}));
        let Some(parent) = parents.first() else { break };
        parent
            .as_str()
            .ok_or_else(|| invalid("lane snap parent"))?
            .clone_into(&mut current);
    }
    Ok(versions)
}

pub(super) fn plan(root: &Path, scope: &str, name: &str, head: &str) -> io::Result<HistoryState> {
    let identity = format!("{scope}/{name}:VersionHistory");
    let hash = format!("{:x}", Sha1::digest(identity.as_bytes()));
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let versions = ancestry(&root.join(".bit/objects"), head)?;
    let value = json!({"name":name,"scope":scope,"versions":versions,"graphCompleteRefs":[]});
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => {
            let before = fs::read(&path)?;
            let existing =
                outbound::read_object(&root.join(".bit/objects"), &hash, "VersionHistory")?;
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

pub(super) fn write(state: &HistoryState) -> io::Result<()> {
    if let Some(bytes) = &state.after {
        fs::create_dir_all(state.path.parent().ok_or_else(|| invalid("history path"))?)?;
        fs::write(&state.path, bytes)?;
    }
    Ok(())
}

fn ensure_absent(path: &PathBuf) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(invalid("lane VersionHistory appeared before removal")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

impl super::VersionedPlan {
    /// Keep the main-line history that the released CLI's clean-status check publishes.
    pub fn with_status_history(mut self) -> io::Result<Self> {
        let (scope, name) = self.workspace.identity
            .split_once('/')
            .ok_or_else(|| invalid("tagged component identity"))?;
        let (_, model_hash) =
            super::index_change(&self.workspace.root, scope, name, super::RowKind::Staged)?;
        let model = outbound::read_object(
            &self.workspace.root.join(".bit/objects"),
            &model_hash,
            "Component",
        )?;
        let head = model["head"].as_str().ok_or_else(|| invalid("tagged component head"))?;
        let (hash, after) = outbound::prepare_version_history(
            &self.workspace.root.join(".bit/objects"),
            scope,
            name,
            head,
        )?;
        let path = self.workspace.root
            .join(".bit/objects")
            .join(&hash[..2])
            .join(&hash[2..]);
        let before = read_history(&self.workspace.root, &path)?;
        self.history = Some(HistoryState { path, before, after: Some(after) });
        Ok(self)
    }
}

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

#[cfg(all(test, unix))]
mod tests;

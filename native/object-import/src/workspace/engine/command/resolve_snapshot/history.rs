use super::{Material, invalid, snapshot};
use crate::workspace::engine::{command::repository::Repository, status_history};
use serde_json::Value;
use std::{io, path::Path};

/// Populate pre-tag heads in existing `VersionHistory` objects during staging.
/// The newly published semantic tag is absent from the canonical history here.
pub(super) fn tag_histories(
    root: &Path,
    materials: &[Material],
    objects: &mut Vec<Value>,
    repository: &mut Repository,
) -> io::Result<()> {
    for material in materials {
        if let Some(history) = tag_history(root, material, repository)? {
            objects.push(snapshot::object("VersionHistory", None, history)?);
        }
    }
    Ok(())
}

fn tag_history(
    root: &Path,
    material: &Material,
    repository: &mut Repository,
) -> io::Result<Option<Value>> {
    if material.version_state.tagged_version.is_none() {
        return Ok(None);
    }
    let reference = status_history::identity(&material.identity);
    let mut history = match repository.read(&reference, "VersionHistory") {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let (scope, name) =
        material.identity.split_once('/').ok_or_else(|| invalid("tag history identity"))?;
    if history["scope"] != scope || history["name"] != name {
        return Err(invalid("tag history identity mismatch"));
    }
    let head = &material.version_state.current_head;
    if head.is_empty() || !super::super::history::populate(root, &mut history, head, repository)? {
        return Ok(None);
    }
    Ok(Some(history))
}

#[cfg(test)]
mod tests;

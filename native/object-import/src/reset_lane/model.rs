//! `removeComponentVersions` model head/tag mutation ([`project`], [`remove_versions`], [`remove_detached`], [`Repository`], [`Selection`]) without deleting `Version` or `Source` objects.
#[cfg(test)]
mod tests;
use super::{ObjectChange, Repository, Selection, changed, diagnostics, invalid};
use serde_json::{Map, Value};
use std::io;

/// Projects head, version-map, and detached-head removals on `repository` ([`Repository`]) for `selection` ([`Selection`]) into [`ObjectChange`].
pub(super) fn project(
    repository: &mut Repository,
    selection: &Selection,
) -> io::Result<Option<ObjectChange>> {
    let scope = repository.model["scope"].as_str().map_or("", str::trim);
    let name = repository.model["name"].as_str().map_or("", str::trim);
    if scope.is_empty() || name.is_empty() {
        return Err(invalid("lane reset Component identity"));
    }
    let identity = format!("{scope}/{name}");
    let had_head = repository.model["head"].is_string();
    if is_removed(&repository.model["head"], &selection.removed) {
        set_head(&mut repository.model, selection.next.as_deref())?;
    }
    remove_versions(&mut repository.model, selection)?;
    remove_detached(&mut repository.model, &selection.removed)?;
    if had_head
        && !repository.model["head"].is_string()
        && repository.model["versions"]
            .as_object()
            .is_some_and(|versions| !versions.is_empty())
    {
        return Err(diagnostics::error(format!(
            r#"fatal: "head" prop was removed from "{identity}", although it has versions"#,
        )));
    }
    changed(&repository.objects, &super::object_hash(&identity), "Component", &repository.model)
        .map(Some)
}

/// Updates or removes the `"head"` field on a `Component` JSON `model`.
fn set_head(model: &mut Value, head: Option<&str>) -> io::Result<()> {
    let fields = model.as_object_mut().ok_or_else(|| invalid("lane reset Component"))?;
    if let Some(head) = head
        .map(str::trim)
        .filter(|head| !head.is_empty())
    {
        fields.insert("head".into(), Value::String(head.to_owned()));
    } else {
        fields.shift_remove("head");
    }
    Ok(())
}

/// Prunes `selection.removed` hashes from `versions` and `orphanedVersions` and clears `state.versions`.
fn remove_versions(model: &mut Value, selection: &Selection) -> io::Result<()> {
    let keep = |hash: &Value| !is_removed(hash, &selection.removed);
    let versions =
        model["versions"].as_object_mut().ok_or_else(|| invalid("lane reset versions"))?;
    versions.retain(|_, hash| keep(hash));
    if let Some(orphaned) = model.get_mut("orphanedVersions").and_then(Value::as_object_mut) {
        orphaned.retain(|_, hash| keep(hash));
    }
    remove_pending_state(model, &selection.labels)?;
    Ok(())
}

/// Removes `labels` from `model["state"]["versions"]` and drops `state` when empty.
fn remove_pending_state(model: &mut Value, labels: &[String]) -> io::Result<()> {
    let Some(state) = model.get_mut("state") else { return Ok(()) };
    if let Some(versions) = state
        .get_mut("versions")
        .and_then(Value::as_object_mut)
        .filter(|versions| !versions.is_empty())
    {
        for label in labels {
            versions.shift_remove(label.trim());
        }
    }
    // Component.removeVersion changes only an existing state.versions entry;
    // Component.toObject omits the constructor's empty default state.
    if state.is_null() || state.as_object().is_some_and(Map::is_empty) {
        model
            .as_object_mut()
            .ok_or_else(|| invalid("lane reset Component"))?
            .shift_remove("state");
    }
    Ok(())
}

/// Prunes `removed` hashes from `model["detachedHeads"]` and deletes `detachedHeads` when empty.
fn remove_detached(model: &mut Value, removed: &[String]) -> io::Result<()> {
    let Some(fields) = model.get_mut("detachedHeads").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    if let Some(heads) = fields.get_mut("heads").and_then(Value::as_array_mut) {
        heads.retain(|head| !is_removed(head, removed));
        if heads.is_empty() {
            fields.shift_remove("heads");
        }
    }
    if fields.get("current").is_some_and(|head| is_removed(head, removed)) {
        fields.shift_remove("current");
    }
    if Map::is_empty(fields) {
        model
            .as_object_mut()
            .ok_or_else(|| invalid("lane reset Component"))?
            .shift_remove("detachedHeads");
    }
    Ok(())
}

#[inline]
#[must_use]
fn is_removed(value: &Value, removed: &[String]) -> bool {
    value
        .as_str()
        .is_some_and(|head| {
            let trimmed = head.trim();
            removed
                .iter()
                .any(|hash| hash.trim().eq_ignore_ascii_case(trimmed))
        })
}

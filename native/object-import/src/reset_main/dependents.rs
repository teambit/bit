//! `DependencyGraph.getImmediateDependentsPerId` guard ([`validate`], [`Selection`], [`validate_row`], [`references`]) for a local `main`-lane reset.

use super::{invalid, outbound, selection::Selection};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Rejects resetting `selection` of `identity` when any other indexed component depends on it.
pub(super) fn validate(
    objects: &Path,
    components: &[Value],
    identity: &str,
    selection: &Selection,
    selected_model: &Value,
) -> io::Result<()> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("reset identity"))?;
    let removed: HashSet<_> = selection.removed
        .iter()
        .chain(&selection.labels)
        .map(String::as_str)
        .map(str::trim)
        .collect();
    for row in components {
        validate_row(objects, row, scope, name, &removed, selected_model)?;
    }
    Ok(())
}

/// Validates in `objects` ([`Path`]) that indexed component `row` ([`Value`]) does not depend on any `removed` version of `(scope, name)`.
fn validate_row(
    objects: &Path,
    row: &Value,
    scope: &str,
    name: &str,
    removed: &HashSet<&str>,
    selected_model: &Value,
) -> io::Result<()> {
    if row["isSymlink"] == true {
        return Ok(());
    }
    let (row_scope, row_name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
    let same = (row_scope == scope || row_scope.is_empty()) && row_name == name;
    let loaded = component_model(objects, row, same)?;
    for reference in references(loaded.as_ref().unwrap_or(selected_model))? {
        if same && removed.contains(reference) {
            continue;
        }
        let version = outbound::read_object(objects, reference, "Version")?;
        if uses_removed(&version, scope, name, removed) {
            return Err(invalid("reset version has a dependent"));
        }
    }
    Ok(())
}

/// Loads the `Component` model for `row` when `same` is `false`.
fn component_model(objects: &Path, row: &Value, same: bool) -> io::Result<Option<Value>> {
    if same {
        return Ok(None);
    }
    let hash = row["hash"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("reset dependent index hash"))?;
    outbound::read_object(objects, hash, "Component").map(Some)
}

/// Collects all tagged, orphaned, head, and local state `Version` hashes on `component`.
fn references(component: &Value) -> io::Result<HashSet<&str>> {
    let versions =
        component["versions"].as_object().ok_or_else(|| invalid("reset dependent versions"))?;
    let mut refs = HashSet::with_capacity(versions.len() + 1);
    for value in versions
        .values()
        .chain(
            component["orphanedVersions"]
                .as_object()
                .into_iter()
                .flat_map(serde_json::Map::values),
        )
    {
        let hash = value
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
            .ok_or_else(|| invalid("reset dependent version hash"))?;
        crate::merge_history::hash(hash)?;
        refs.insert(hash);
    }
    if let Some(head) = component["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
    {
        crate::merge_history::hash(head)?;
        refs.insert(head);
    }
    if let Some(local) = component["state"]["versions"].as_object() {
        for label in local
            .keys()
            .map(String::as_str)
            .map(str::trim)
            .filter(|label| crate::merge_history::hash(label).is_ok())
        {
            refs.insert(label);
        }
    }
    Ok(refs)
}

fn uses_removed(version: &Value, scope: &str, name: &str, removed: &HashSet<&str>) -> bool {
    let dep_matches =
        ["dependencies", "devDependencies", "peerDependencies", "extensionDependencies"]
            .into_iter()
            .filter_map(|field| version[field].as_array())
            .flatten()
            .any(|dependency| id_matches_removed(dependency, scope, name, removed));
    dep_matches
        || version["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|ext| {
                id_matches_removed(&ext["extensionId"], scope, name, removed)
                    || id_matches_removed(ext, scope, name, removed)
            })
}

#[inline]
#[must_use]
fn non_empty(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn id_matches_removed(entry: &Value, scope: &str, name: &str, removed: &HashSet<&str>) -> bool {
    if let Some(raw) = non_empty(entry).or_else(|| non_empty(&entry["id"])) {
        return raw
            .strip_prefix(scope)
            .and_then(|rest| rest.strip_prefix('/'))
            .and_then(|rest| rest.strip_prefix(name))
            .and_then(|rest| rest.strip_prefix('@'))
            .is_some_and(|version| removed.contains(version.trim()));
    }
    let id = entry
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(entry);
    let raw_name = non_empty(&id["name"])
        .or_else(|| non_empty(&entry["name"]))
        .unwrap_or_default();
    let (bare_name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| {
            (bare.trim(), Some(ver.trim()).filter(|ver| !ver.is_empty()))
        });
    let version = non_empty(&id["version"])
        .or_else(|| non_empty(&entry["version"]))
        .or_else(|| non_empty(&entry["head"]))
        .or(inline_ver);
    non_empty(&id["scope"]).or_else(|| non_empty(&entry["scope"])) == Some(scope)
        && bare_name == name
        && version.is_some_and(|ver| removed.contains(ver))
}

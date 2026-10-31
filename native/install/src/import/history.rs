//! `BIT_FETCH_INCOMPLETE_VERSION_HISTORY` (`ScopeComponentsImporter.getIncompleteVersionHistory`):
//! a component whose local `VersionHistory` is not complete since the requested
//! version is fetched again, and histories found complete record that fact in
//! `graphCompleteRefs`.

#[cfg(test)]
mod tests;

use super::{
    bitmap::Id,
    fs_remote::resolve_version,
    objects::{Repo, compress_json, invalid, version_history_hash},
};
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

/// The variable is set to anything but the empty string (`process.env` truthiness).
#[must_use]
pub fn refetch_requested() -> bool {
    std::env::var_os("BIT_FETCH_INCOMPLETE_VERSION_HISTORY")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}

/// Versioned ids whose component exists locally and whose `VersionHistory` is
/// not complete since that version. Histories that are complete but did not
/// say so yet are rewritten with the version added to `graphCompleteRefs`.
pub fn incomplete(repo: &Repo, ids: &[Id]) -> io::Result<Vec<Id>> {
    let mut incomplete = Vec::new();
    for id in ids {
        let Some(version) = id.version.as_deref() else { continue };
        let Some(component) = repo.read_json(&super::objects::component_hash(&id.scope, &id.name))?
        else {
            continue;
        };
        let hash = version_history_hash(&id.scope, &id.name);
        let Some(history) = repo.read_json(&hash)? else { continue };
        if versions(&history).is_empty() {
            continue;
        }
        let reference = resolve_version(&component, version)
            .ok_or_else(|| {
                invalid(&format!(
                    "importMany, a ref for {} is needed for version-history validation",
                    id.to_request(),
                ))
            })?;
        match check(&history, &reference) {
            Completeness::Recorded => {}
            Completeness::Complete => record(repo, &hash, &history, &reference)?,
            Completeness::Incomplete => incomplete.push(id.clone()),
        }
    }
    Ok(incomplete)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Completeness {
    /// `graphCompleteRefs` already lists the version.
    Recorded,
    /// Every ancestor is in the history; not recorded yet.
    Complete,
    Incomplete,
}

/// `VersionHistory.isGraphCompleteSince`: `getAllHashesFrom(ref)` finds no missing parent.
#[must_use]
pub fn check(history: &Value, reference: &str) -> Completeness {
    let recorded = history["graphCompleteRefs"]
        .as_array()
        .is_some_and(|refs| {
            refs.iter()
                .any(|item| item.as_str() == Some(reference))
        });
    if recorded {
        return Completeness::Recorded;
    }
    if missing_from(history, reference) { Completeness::Incomplete } else { Completeness::Complete }
}

/// `getAllHashesFrom(start).missing` is not empty.
fn missing_from(history: &Value, start: &str) -> bool {
    let versions = versions(history);
    let parents = |hash: &str| {
        versions
            .iter()
            .find(|version| version["hash"].as_str() == Some(hash))
            .map(|version| strings(&version["parents"]))
    };
    let Some(first) = parents(start) else { return true };
    let mut seen: HashSet<String> = HashSet::from([start.to_string()]);
    let mut stack = vec![first];
    while let Some(current) = stack.pop() {
        for parent in current {
            if seen.contains(&parent) {
                continue;
            }
            let Some(grandparents) = parents(&parent) else { return true };
            seen.insert(parent);
            stack.push(grandparents);
        }
    }
    false
}

/// Write the history again with `reference` appended to `graphCompleteRefs`,
/// serialized in `VersionHistory.toObject()` key order.
fn record(repo: &Repo, hash: &str, history: &Value, reference: &str) -> io::Result<()> {
    let mut refs: Vec<Value> = history["graphCompleteRefs"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    refs.push(Value::String(reference.to_string()));
    let mut object = Map::new();
    object.insert("name".into(), history["name"].clone());
    object.insert("scope".into(), history["scope"].clone());
    object.insert(
        "versions".into(),
        Value::Array(
            versions(history)
                .iter()
                .map(to_object)
                .collect(),
        ),
    );
    object.insert("graphCompleteRefs".into(), Value::Array(refs));
    repo.write_raw(hash, &compress_json("VersionHistory", hash, &Value::Object(object))?)
}

/// One `VersionParents` as `toObject()` writes it: `unrelated` and `squashed`
/// only when set.
fn to_object(version: &Value) -> Value {
    let mut object = Map::new();
    object.insert("hash".into(), version["hash"].clone());
    object.insert(
        "parents".into(),
        Value::Array(
            version["parents"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        ),
    );
    for key in ["unrelated", "squashed"] {
        if !version[key].is_null() {
            object.insert(key.into(), version[key].clone());
        }
    }
    Value::Object(object)
}

fn versions(history: &Value) -> &[Value] {
    history["versions"]
        .as_array()
        .map_or(&[], Vec::as_slice)
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .map(str::to_string)
        })
        .collect()
}

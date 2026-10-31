//! `addToRootPolicy` + `updateConfigPolicy` + `persistConfig('install')`.

#[cfg(test)]
mod tests;

use super::super::{
    session::{Loaded, Session},
    workspace_jsonc,
};
use crate::{config::DEPENDENCY_RESOLVER_ASPECT, jsonc::Document, options::ExistingEntries};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};
use std::io;

const FIELDS: [&str; 2] = ["dependencies", "peerDependencies"];

/// One `WorkspacePolicyEntry`: field index (0 runtime, 1 peer), name, config value.
type Entry = (usize, String, Value);

fn resolver_key(document: &Document) -> String {
    document
        .value()
        .as_object()
        .and_then(|map| {
            map.keys()
                .find(|key| {
                    key.as_str() == DEPENDENCY_RESOLVER_ASPECT
                        || key.starts_with(&format!("{DEPENDENCY_RESOLVER_ASPECT}@"))
                })
        })
        .cloned()
        .unwrap_or_else(|| DEPENDENCY_RESOLVER_ASPECT.to_owned())
}

/// Add runtime entries to a comment-preserving document using `WorkspacePolicy.add` semantics.
pub fn update_document(
    document: &mut Document,
    entries: &[(String, String)],
    existing: ExistingEntries,
) -> io::Result<()> {
    let key = resolver_key(document);
    let initial = document
        .get(&[&key, "policy"])
        .unwrap_or(Value::Null);
    let mut policy = config_entries(&initial);
    for (name, version) in entries {
        if admits(&policy, name, existing)? {
            policy.push((0, name.clone(), json!(version)));
        }
    }
    update_config_policy(document, &to_config_object(&policy));
    Ok(())
}

/// Remove `packages` from `dependencies` and `peerDependencies` in the workspace policy.
pub fn remove_from_document(document: &mut Document, packages: &[String]) -> bool {
    let key = resolver_key(document);
    let initial = document
        .get(&[&key, "policy"])
        .unwrap_or(Value::Null);
    let policy = config_entries(&initial);
    let original_len = policy.len();
    let retained: Vec<Entry> = policy
        .into_iter()
        .filter(|(_, name, _)| {
            !packages
                .iter()
                .any(|package| package == name)
        })
        .collect();
    let changed = retained.len() != original_len;
    if changed {
        update_config_policy(document, &to_config_object(&retained));
    }
    changed
}

/// Add `entries` (`[name, version]`) with `updateExisting` and write `workspace.jsonc`.
pub fn add_to_root_policy(
    session: &Session<'_>,
    loaded: &Loaded,
    entries: &[(String, String)],
    lifecycle: &str,
) -> io::Result<()> {
    let field = usize::from(lifecycle == "peer");
    let mut policy = config_entries(&loaded.config.dependency_resolver.policy);
    for (name, version) in entries {
        if !admits(&policy, name, session.options.existing_entries)? {
            continue;
        }
        // `remove()` returns a new policy without changing this one, so an existing
        // entry stays and the added one, written later, wins in `toConfigObject`.
        policy.push((field, name.clone(), json!(version)));
    }
    let fields = to_config_object(&policy);
    workspace_jsonc::edit(
        &session.root,
        &loaded.workspace.scope_path,
        &session.info.file_id,
        "install",
        |document| update_config_policy(document, &fields),
    )
}

/// `WorkspacePolicy.add`: an entry with the same name in any lifecycle is
/// updated, kept, or an error.
fn admits(policy: &[Entry], name: &str, existing: ExistingEntries) -> io::Result<bool> {
    if !policy
        .iter()
        .any(|(_, entry_name, _)| entry_name == name)
    {
        return Ok(true);
    }
    match existing {
        ExistingEntries::Update => Ok(true),
        ExistingEntries::Skip => Ok(false),
        ExistingEntries::Fail => Err(io::Error::other(format!(
            "policy entry with {name} already exists, use install -u | --update-existing to update the entry",
        ))),
    }
}

/// `WorkspacePolicyFactory.fromConfigObject`: runtime entries, then peers; values
/// become `{ version, preserve }`.
fn config_entries(policy: &Value) -> Vec<Entry> {
    let mut entries = Vec::new();
    for (index, field) in FIELDS.iter().enumerate() {
        let Some(Value::Object(object)) = policy.get(field) else { continue };
        for (name, value) in object {
            if !entries
                .iter()
                .any(|(existing, entry_name, _)| *existing == index && entry_name == name)
            {
                entries.push((index, name.clone(), entry_value(value)));
            }
        }
    }
    entries
}

/// `entry.value.preserve ? entry.value : entry.value.version`.
fn entry_value(value: &Value) -> Value {
    let Value::Object(object) = value else { return value.clone() };
    let version = object
        .get("version")
        .cloned()
        .unwrap_or(Value::Null);
    if object.get("preserve").is_some_and(truthy) {
        return json!({ "version": version, "preserve": object["preserve"] });
    }
    version
}

fn truthy(value: &Value) -> bool {
    !matches!(value, Value::Null | Value::Bool(false)) && value.as_str() != Some("")
}

/// `toConfigObject`: both fields, later entries win, keys sorted.
fn to_config_object(entries: &[Entry]) -> [IndexMap<String, Value>; 2] {
    let mut fields: [IndexMap<String, Value>; 2] = Default::default();
    for (index, name, value) in entries {
        fields[*index].insert(name.clone(), value.clone());
    }
    for field in &mut fields {
        field.sort_unstable_keys();
    }
    fields
}

/// `updateConfigPolicy` and `setExtension(..., { mergeIntoExisting: true })`.
fn update_config_policy(document: &mut Document, fields: &[IndexMap<String, Value>; 2]) {
    let key = resolver_key(document);
    if document.get(&[&key]).is_none() {
        let policy: Map<String, Value> = FIELDS
            .iter()
            .zip(fields)
            .map(|(name, entries)| {
                ((*name).to_string(), Value::Object(entries.clone().into_iter().collect()))
            })
            .collect();
        document.set(&[&key], &json!({ "policy": policy, "linkCoreAspects": true }));
        return;
    }
    for (name, entries) in FIELDS.iter().zip(fields) {
        let path = [key.as_str(), "policy", name];
        if matches!(document.get(&path), Some(Value::Object(_))) {
            document.replace_entries(&path, entries);
        } else {
            document.set(&path, &Value::Object(entries.clone().into_iter().collect()));
        }
    }
    if document
        .get(&[&key, "linkCoreAspects"])
        .is_none()
    {
        document.set(&[&key, "linkCoreAspects"], &json!(true));
    }
}

//! `addToRootPolicy` + `updateConfigPolicy` + `persistConfig('install')`.

use super::super::{
    session::{Loaded, Session},
    workspace_jsonc,
};
use crate::{config::DEPENDENCY_RESOLVER_ASPECT, jsonc::Document};
use indexmap::IndexMap;
use serde_json::{Map, Value, json};
use std::io;

const FIELDS: [&str; 2] = ["dependencies", "peerDependencies"];

/// One `WorkspacePolicyEntry`: field index (0 runtime, 1 peer), name, config value.
type Entry = (usize, String, Value);

/// Add `entries` (`[name, version]`) with `updateExisting` and write `workspace.jsonc`.
pub fn add_to_root_policy(
    session: &Session<'_>,
    loaded: &Loaded,
    entries: &[(String, String)],
    lifecycle: &str,
) -> io::Result<()> {
    let field = usize::from(lifecycle == "peer");
    let mut policy = config_entries(&loaded.config.dependency_resolver.policy);
    // `remove()` returns a new policy without changing this one, so an existing
    // entry stays and the added one, written later, wins in `toConfigObject`.
    policy.extend(
        entries
            .iter()
            .map(|(name, version)| (field, name.clone(), json!(version))),
    );
    let fields = to_config_object(&policy);
    workspace_jsonc::edit(
        &session.root,
        &loaded.workspace.scope_path,
        &session.info.file_id,
        "install",
        |document| update_config_policy(document, &fields),
    )
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
    if document
        .get(&[DEPENDENCY_RESOLVER_ASPECT])
        .is_none()
    {
        let policy: Map<String, Value> = FIELDS
            .iter()
            .zip(fields)
            .map(|(name, entries)| {
                ((*name).to_string(), Value::Object(entries.clone().into_iter().collect()))
            })
            .collect();
        document.set(
            &[DEPENDENCY_RESOLVER_ASPECT],
            &json!({ "policy": policy, "linkCoreAspects": true }),
        );
        return;
    }
    for (name, entries) in FIELDS.iter().zip(fields) {
        let path = [DEPENDENCY_RESOLVER_ASPECT, "policy", name];
        if matches!(document.get(&path), Some(Value::Object(_))) {
            document.replace_entries(&path, entries);
        } else {
            document.set(&path, &Value::Object(entries.clone().into_iter().collect()));
        }
    }
    if document
        .get(&[DEPENDENCY_RESOLVER_ASPECT, "linkCoreAspects"])
        .is_none()
    {
        document.set(&[DEPENDENCY_RESOLVER_ASPECT, "linkCoreAspects"], &json!(true));
    }
}

#[cfg(test)]
mod tests;

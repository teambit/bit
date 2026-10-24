//! Merging fetched Component, Version and `VersionHistory` objects into local ones
//! (`MultipleComponentMerger`, `ModelComponentMerger` for imports,
//! `ObjectsWritable.mergeVersionObject`/`mergeVersionHistory`).

use super::objects::invalid;
use serde_json::{Map, Value, json};
use std::io;

/// Merge an incoming Component into the existing one. Returns the component to
/// store. `origin` is true when it came from the component's own scope.
pub fn merge_component(
    existing: Option<&Value>,
    incoming: &Value,
    origin: bool,
) -> io::Result<Value> {
    let Some(existing) = existing.filter(|existing| *existing != incoming) else {
        return Ok(Fields::from(incoming).to_object());
    };
    let local = local_versions(existing);
    let plan = bit_object_import::plan_import_operation(json!({
        "kind": "component",
        "existing": tags(&existing["versions"]),
        "incoming": tags(&incoming["versions"]),
        "orphaned": tags(&incoming["orphanedVersions"]),
        "local": local,
        "origin": origin,
        "heads": [detached(existing, "heads"), detached(incoming, "heads")],
        "deleted": [detached(existing, "deleted"), detached(incoming, "deleted")],
    }))?;
    if let Some(conflicts) = plan["conflicts"]
        .as_array()
        .filter(|conflicts| !conflicts.is_empty())
    {
        return Err(merge_conflict(existing, conflicts));
    }
    let mut merged = Fields::from(existing);
    apply_actions(&mut merged, existing, incoming, &plan["actions"])?;
    if origin && local.is_empty() && incoming["head"].is_string() {
        merged.head = incoming["head"].clone();
    }
    merged.detached_heads = merged_heads(existing, incoming, &plan);
    Ok(merged.to_object())
}

/// `ModelComponent.getLocalVersions()`: tags marked `local` in `state.versions`.
fn local_versions(component: &Value) -> Vec<String> {
    component["state"]["versions"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, state)| state["local"].as_bool() == Some(true))
        .map(|(tag, _)| tag.clone())
        .collect()
}

fn tags(versions: &Value) -> Vec<[String; 2]> {
    versions
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(tag, hash)| Some([tag.clone(), hash.as_str()?.to_string()]))
        .collect()
}

fn detached(component: &Value, key: &str) -> Vec<String> {
    component["detachedHeads"][key]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|hash| hash.as_str().map(str::to_string))
        .collect()
}

/// `MergeConflict` for import.
fn merge_conflict(component: &Value, conflicts: &[Value]) -> io::Error {
    let id = format!(
        "{}/{}",
        component["scope"].as_str().unwrap_or_default(),
        component["name"].as_str().unwrap_or_default(),
    );
    let versions: Vec<&str> = conflicts
        .iter()
        .filter_map(Value::as_str)
        .collect();
    io::Error::other(format!(
        "error: versions conflict occurred while importing the component {id}. conflict version(s): {}
to resolve it and merge your local and remote changes, please do the following:
1) bit reset {id}
2) bit import
3) bit checkout head {id}
once your changes are merged with the new remote version, you can tag and export a new version of the component to the remote scope.",
        versions.join(", "),
    ))
}

/// The `ModelComponent` fields `toObject()` writes, in its order.
struct Fields {
    head: Value,
    detached_heads: Value,
    versions: Map<String, Value>,
    orphaned: Map<String, Value>,
    rest: Map<String, Value>,
}

const LEADING: [&str; 2] = ["name", "scope"];
const MIDDLE: [&str; 5] = ["lang", "deprecated", "bindingPrefix", "remotes", "schema"];

impl Fields {
    fn from(component: &Value) -> Self {
        let object = component
            .as_object()
            .cloned()
            .unwrap_or_default();
        Self {
            head: object
                .get("head")
                .cloned()
                .unwrap_or(Value::Null),
            detached_heads: object
                .get("detachedHeads")
                .cloned()
                .unwrap_or(Value::Null),
            versions: object
                .get("versions")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            orphaned: object
                .get("orphanedVersions")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            rest: object,
        }
    }

    /// `ModelComponent.toObject()`; `undefined` and empty optional fields are omitted.
    fn to_object(&self) -> Value {
        let mut object = Map::new();
        for key in LEADING {
            self.copy(&mut object, key);
        }
        object.insert("versions".to_string(), Value::Object(self.versions.clone()));
        for key in MIDDLE {
            self.copy(&mut object, key);
        }
        if !self.detached_heads.is_null() {
            object.insert("detachedHeads".to_string(), self.detached_heads.clone());
        }
        self.insert_local_state(&mut object);
        if !self.orphaned.is_empty() {
            object.insert("orphanedVersions".to_string(), Value::Object(self.orphaned.clone()));
        }
        if self.head.is_string() {
            object.insert("head".to_string(), self.head.clone());
        }
        Value::Object(object)
    }

    fn copy(&self, object: &mut Map<String, Value>, key: &str) {
        if let Some(value) = self.rest
            .get(key)
            .filter(|value| !value.is_null())
        {
            object.insert(key.to_string(), value.clone());
        }
    }

    /// `local` when true and a non-empty `state`.
    fn insert_local_state(&self, object: &mut Map<String, Value>) {
        if self.rest
            .get("local")
            .is_some_and(|local| local.as_bool() == Some(true))
        {
            object.insert("local".to_string(), json!(true));
        }
        let state = self.rest
            .get("state")
            .filter(|state| {
                state
                    .as_object()
                    .is_some_and(|state| !state.is_empty())
            });
        if let Some(state) = state {
            object.insert("state".to_string(), state.clone());
        }
    }
}

/// Apply the native plan's `[kind, side, index]` tag actions (`mergeNative`).
fn apply_actions(
    merged: &mut Fields,
    existing: &Value,
    incoming: &Value,
    actions: &Value,
) -> io::Result<()> {
    let sides = [
        tags(&existing["versions"]),
        tags(&incoming["versions"]),
        tags(&incoming["orphanedVersions"]),
    ];
    for action in actions.as_array().into_iter().flatten() {
        let kind = action[0].as_str().unwrap_or_default();
        let side = usize::try_from(action[1].as_u64().unwrap_or(9)).unwrap_or(9);
        let index = usize::try_from(action[2].as_u64().unwrap_or(u64::MAX)).unwrap_or(usize::MAX);
        let [tag, hash] = sides
            .get(side)
            .and_then(|tags| tags.get(index))
            .ok_or_else(|| invalid("component merge action"))?;
        match kind {
            "remove" => {
                merged.versions.shift_remove(tag);
                merged.orphaned.insert(tag.clone(), json!(hash));
            }
            "tag" => {
                merged.versions.insert(tag.clone(), json!(hash));
                merged.orphaned.shift_remove(tag);
            }
            "orphan" if !merged.versions.contains_key(tag) => {
                merged.orphaned.insert(tag.clone(), json!(hash));
            }
            "orphan" => return Err(invalid(&format!(r#"unable to save orphanedVersion "{tag}""#))),
            _ => return Err(invalid("component merge action")),
        }
    }
    Ok(())
}

/// `DetachedHeads.mergeNative` from the plan's selections.
fn merged_heads(existing: &Value, incoming: &Value, plan: &Value) -> Value {
    let pick = |key: &str| -> Vec<Value> {
        let all = [detached(existing, key), detached(incoming, key)];
        plan[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|pair| {
                let side = usize::try_from(pair[0].as_u64()?).ok()?;
                let index = usize::try_from(pair[1].as_u64()?).ok()?;
                all.get(side)?
                    .get(index)
                    .map(|hash| json!(hash))
            })
            .collect()
    };
    let (heads, deleted) = (pick("heads"), pick("deleted"));
    let current = existing["detachedHeads"]["current"].clone();
    let mut object = Map::new();
    if !heads.is_empty() {
        object.insert("heads".to_string(), Value::Array(heads));
    }
    if !deleted.is_empty() {
        object.insert("deleted".to_string(), Value::Array(deleted));
    }
    if current.is_string() {
        object.insert("current".to_string(), current);
    }
    if object.is_empty() { Value::Null } else { Value::Object(object) }
}

/// `Version.lastModified()`.
fn last_modified(version: &Value) -> Option<&str> {
    version["modified"]
        .as_array()
        .and_then(|modified| modified.last())
        .and_then(|entry| entry["date"].as_str())
        .or_else(|| version["log"]["date"].as_str())
}

/// `mergeVersionObject`: keep the existing Version when it was modified later.
#[must_use]
pub fn keep_existing_version(existing: &Value, incoming: &Value) -> bool {
    matches!((last_modified(existing), last_modified(incoming)), (Some(old), Some(new)) if old > new)
}

/// `VersionHistory.merge`: incoming versions, then those only the existing one has.
#[must_use]
pub fn merge_version_history(existing: &Value, incoming: &Value) -> Value {
    let incoming_versions = incoming["versions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut merged = incoming_versions.clone();
    for version in existing["versions"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if !incoming_versions
            .iter()
            .any(|other| other["hash"] == version["hash"])
            && !merged.contains(version)
        {
            merged.push(version.clone());
        }
    }
    let mut result = existing.clone();
    result["versions"] = Value::Array(merged);
    result
}

//! `currentStatusMetadata`: the component metadata `statusCompare` compares
//! with the stored version.

use super::{
    super::js::{array, decline, text, truthy},
    PACKAGE_FIELDS, Policy,
};
use serde_json::{Map, Value, json};
use std::io;

/// `currentStatusMetadata(target, policy, output)`: what `statusCompare`
/// compares with the stored version. Absent fields are left out, as
/// `JSON.stringify` leaves out `undefined`.
pub fn current_metadata(target: &Value, policy: &Policy, output: &Value) -> io::Result<Value> {
    let state = &output["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let lifecycles = array(state.get("components"), "dependency lifecycles")?;
    let dependencies = lifecycles
        .iter()
        .map(|indices| metadata_dependencies(indices, entries))
        .collect::<io::Result<Vec<_>>>()?;
    let mut metadata = Map::new();
    if let Some(main) = target
        .get("mainFile")
        .filter(|val| !val.is_null())
    {
        metadata.insert("mainFile".into(), main.clone());
    }
    for (index, field) in ["dependencies", "devDependencies"].into_iter().enumerate() {
        if let Some(value) = dependencies.get(index) {
            metadata.insert(field.into(), value.clone());
        }
    }
    for (index, field) in PACKAGE_FIELDS.into_iter().enumerate() {
        if let Some(value) = state
            .get("packages")
            .and_then(|packages| packages.get(index))
        {
            metadata.insert(field.into(), value.clone());
        }
    }
    metadata.insert("bindingPrefix".into(), json!(policy.binding_prefix));
    metadata.insert("overrides".into(), policy.overrides.clone());
    metadata.insert("extensions".into(), projected_extensions(policy, output)?);
    Ok(Value::Object(metadata))
}

fn projected_extensions(policy: &Policy, output: &Value) -> io::Result<Value> {
    let ids = array(output.get("extensions"), "extension versions")?;
    let mut extensions = policy.extensions.clone();
    let mut selected = ids.iter();
    for extension in &mut extensions {
        if extension.get("extensionId").is_some()
            || extension.get("legacyId").is_some()
            || extension.get("id").is_some()
        {
            let id = selected.next().ok_or_else(|| decline("status extension versions"))?;
            extension["extensionId"] = super::projection::extension_id(text(Some(id))?)?;
        }
    }
    if selected.next().is_some() {
        return Err(decline("status extra extension versions"));
    }
    Ok(json!(extensions))
}

/// Peer component metadata for the published `ConsumerComponent` adapter.
pub fn peer_metadata(state: &Value) -> io::Result<Value> {
    let entries = array(state.get("entries"), "peer dependency entries")?;
    metadata_dependencies(&state["components"][2], entries)
}

fn metadata_dependencies(indices: &Value, entries: &[Value]) -> io::Result<Value> {
    let indices = array(Some(indices), "dependency indices")?;
    let rows = indices
        .iter()
        .map(|index| {
            let entry = index
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .and_then(|index| entries.get(index));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            let mut row = Map::new();
            row.insert("id".into(), identity_object(text(entry.get("identity"))?)?);
            row.insert("relativePaths".into(), json!([]));
            for field in ["packageName", "versionRange"] {
                if truthy(entry.get(field)) {
                    row.insert(field.into(), entry[field].clone());
                }
            }
            Ok(Value::Object(row))
        });
    rows.collect::<io::Result<Vec<_>>>().map(Value::Array)
}

/// `identityObject(value)`: `{ scope, name, version? }`.
fn identity_object(value: &str) -> io::Result<Value> {
    let mut parts = value.trim().split('@');
    let name = parts.next().unwrap_or_default().trim();
    let version = parts
        .next()
        .map(str::trim)
        .filter(|version| !version.is_empty());
    let (scope, comp_name) = name
        .split_once('/')
        .map(|(scope, comp)| (scope.trim(), comp.trim()))
        .filter(|(scope, comp)| !scope.is_empty() && !comp.is_empty())
        .ok_or_else(|| decline("status unscoped dependency"))?;
    let mut id = Map::new();
    id.insert("scope".into(), json!(scope));
    id.insert("name".into(), json!(comp_name));
    if let Some(version) = version {
        id.insert("version".into(), json!(version));
    }
    Ok(Value::Object(id))
}

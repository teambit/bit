use super::super::{invalid, policy};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Component {
    pub(super) identity: String,
    extensions: Value,
    package_name: String,
    default_node: policy::projection::Defaults,
    pub(super) dependency_state: Value,
}

pub(super) fn version(
    stored: &Value,
    current: &Value,
    files: &Value,
    receipt: &Component,
) -> io::Result<Value> {
    let mut version = crate::workspace::engine::status_models::harmony::project(stored)?;
    for field in ["mainFile", "bindingPrefix", "overrides"] {
        if let Some(value) = current.get(field) {
            version[field] = value.clone();
        }
    }
    version["files"] = files.clone();
    let state = &receipt.dependency_state;
    component_dependencies(&mut version, state)?;
    for (index, field) in
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"]
            .iter()
            .enumerate()
    {
        if !state["packages"][index].is_object() {
            return Err(invalid("resolve package dependency state"));
        }
        version[*field] = state["packages"][index].clone();
    }
    version["extensions"] = policy::projection::extensions(
        &stored["extensions"],
        &receipt.extensions,
        state,
        &receipt.default_node,
        &receipt.package_name,
    )?;
    Ok(version)
}

fn component_dependencies(version: &mut Value, state: &Value) -> io::Result<()> {
    for (index, field) in ["dependencies", "devDependencies", "peerDependencies"].iter().enumerate()
    {
        let indices = state["components"][index]
            .as_array()
            .ok_or_else(|| invalid("resolve component dependency state"))?;
        let mut values = Vec::new();
        for index in indices {
            let index = index.as_u64().ok_or_else(|| invalid("resolve dependency index"))? as usize;
            let entry = state["entries"]
                .as_array()
                .and_then(|rows| rows.get(index))
                .ok_or_else(|| invalid("resolve dependency entry"))?;
            values.push(policy::dependencies::component(entry, &HashSet::new())?);
        }
        version[*field] = json!(values);
    }
    Ok(())
}

pub(super) fn bind_new_dependencies(
    components: &mut [Component],
    identities: &HashSet<String>,
) -> io::Result<()> {
    for component in components {
        let entries = component.dependency_state["entries"]
            .as_array_mut()
            .ok_or_else(|| invalid("snap dependency entries"))?;
        for entry in entries {
            let Some(identity) = entry["identity"]
                .as_str()
                .filter(|identity| identities.contains(*identity))
            else {
                continue;
            };
            entry["identity"] = json!(format!("{identity}@__bit_pending_snapshot__:{identity}"));
        }
    }
    Ok(())
}

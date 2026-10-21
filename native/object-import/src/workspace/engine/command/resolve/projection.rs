use super::super::{invalid, policy};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine::command) struct Component {
    pub(in crate::workspace::engine::command) identity: String,
    extensions: Value,
    #[serde(default)]
    callback_extensions: Option<Value>,
    package_name: String,
    default_node: policy::projection::Defaults,
    pub(in crate::workspace::engine::command) dependency_state: Value,
}

pub(in crate::workspace::engine::command) fn version(
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
    package_dependencies(&mut version, current, receipt)?;
    version["extensions"] = if let Some(callbacks) = &receipt.callback_extensions {
        policy::projection::callback_extensions(callbacks)?
    } else {
        policy::projection::extensions(
            &stored["extensions"],
            &receipt.extensions,
            state,
            &receipt.default_node,
            &receipt.package_name,
        )?
    };
    Ok(version)
}

fn package_dependencies(
    version: &mut Value,
    current: &Value,
    receipt: &Component,
) -> io::Result<()> {
    let state = &receipt.dependency_state;
    for (index, field) in
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"]
            .iter()
            .enumerate()
    {
        if !state["packages"][index].is_object() {
            return Err(invalid("resolve package dependency state"));
        }
        version[*field] = if receipt.callback_extensions.is_some() {
            current
                .get(*field)
                .cloned()
                .unwrap_or_else(|| state["packages"][index].clone())
        } else {
            state["packages"][index].clone()
        };
    }
    Ok(())
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
        bind_new_extensions(&mut component.extensions, identities);
        if let Some(callbacks) = &mut component.callback_extensions {
            bind_new_extensions(callbacks, identities);
        }
    }
    Ok(())
}

fn bind_new_extensions(extensions: &mut Value, identities: &HashSet<String>) {
    for extension in extensions
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        bind_extension_id(extension, identities);
        if extension["name"] == "teambit.dependencies/dependency-resolver" {
            for dep in extension["data"]["dependencies"]
                .as_array_mut()
                .into_iter()
                .flatten()
            {
                bind_resolver_dependency(dep, identities);
            }
        }
    }
}

fn bind_extension_id(extension: &mut Value, identities: &HashSet<String>) {
    if let Some(id) = extension.get_mut("extensionId")
        && id.get("version").is_none()
        && let Ok(identity) = super::selection::identity(id)
        && identities.contains(&identity)
    {
        id["version"] = json!(format!("__bit_pending_snapshot__:{identity}"));
    }
}

fn bind_resolver_dependency(dep: &mut Value, identities: &HashSet<String>) {
    if dep["__type"] != "component" {
        return;
    }
    let Some(cid) = dep.get_mut("componentId") else {
        return;
    };
    if cid.get("version").is_some() {
        return;
    }
    let Ok(identity) = super::selection::identity(cid) else {
        return;
    };
    if !identities.contains(&identity) {
        return;
    }
    let marker = format!("__bit_pending_snapshot__:{identity}");
    cid["version"] = json!(marker);
    dep["id"] = json!(format!("{identity}@{marker}"));
    dep["version"] = json!(marker);
}

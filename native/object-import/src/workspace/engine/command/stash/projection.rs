//! Unversioned workspace IDs reach the detached graph's canonical rejection.
use super::{
    super::resolve::projection::{self, Component},
    invalid,
};
use serde_json::Value;
use std::io;

pub(super) fn version(
    stored: &Value,
    current: &Value,
    files: &Value,
    receipt: &Component,
) -> io::Result<Value> {
    let mut receipt = receipt.clone();
    for entry in receipt.dependency_state["entries"]
        .as_array_mut()
        .ok_or_else(|| invalid("stash dependency entries"))?
    {
        let identity =
            entry["identity"].as_str().ok_or_else(|| invalid("stash dependency identity"))?;
        if !identity.contains('@') {
            entry["identity"] = Value::String(format!("{identity}@"));
        }
    }
    let mut version = projection::version(stored, current, files, &receipt)?;
    clean_dependencies(&mut version);
    clean_extensions(&mut version);
    Ok(version)
}

fn clean_dependencies(version: &mut Value) {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        for dependency in version[field]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            remove_empty_version(&mut dependency["id"]);
        }
    }
}

fn clean_extensions(version: &mut Value) {
    for extension in version["extensions"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        if !crate::workspace::engine::client_status::config::is_extension_aspect(
            extension,
            "teambit.dependencies/dependency-resolver",
        ) {
            continue;
        }
        for dependency in extension["data"]["dependencies"]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            clean_resolver_dependency(dependency);
        }
    }
}

fn clean_resolver_dependency(dependency: &mut Value) {
    remove_empty_version(dependency);
    if let Some(id) = dependency["id"]
        .as_str()
        .and_then(|id| id.strip_suffix('@'))
    {
        dependency["id"] = Value::String(id.to_owned());
    }
    if let Some(id) = dependency.get_mut("componentId") {
        remove_empty_version(id);
    }
}

fn remove_empty_version(value: &mut Value) {
    if value["version"] == ""
        && let Some(value) = value.as_object_mut()
    {
        value.remove("version");
    }
}

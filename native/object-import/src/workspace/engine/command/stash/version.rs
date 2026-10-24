use super::{Allocation, Component, invalid};
use crate::workspace::{
    engine::command::{merge::snapshot, resolve_snapshot::sources},
    snapshots,
};
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use std::io;

const FIELDS: &[&str] = &[
    "mainFile",
    "bindingPrefix",
    "schema",
    "log",
    "docs",
    "dependencies",
    "devDependencies",
    "packageDependencies",
    "devPackageDependencies",
    "peerPackageDependencies",
    "flattenedDependencies",
    "extensions",
    "overrides",
    "packageJsonChangedProps",
    "buildStatus",
];

pub(super) fn prepare(
    component: &Component,
    allocation: &Allocation,
    bit_version: &str,
    snapshots: &snapshots::State,
    objects: &mut Vec<Value>,
) -> io::Result<Value> {
    let mut version = base(component);
    if version.get("log").is_none_or(Value::is_null) {
        version["log"] = allocation.log.clone().ok_or_else(|| invalid("stash basic log absent"))?;
    } else if allocation.log.is_some() {
        return Err(invalid("stash existing log override"));
    }
    validate_log(&version["log"])?;
    version["bitVersion"] = json!(bit_version);
    version["modified"] = json!([]);
    version["parents"] = json!(component.previous.iter().collect::<Vec<_>>());
    // StashMain ignores the returned graph Sources; only the Version references them.
    let graph =
        component.version.get("flattenedEdges").ok_or_else(|| invalid("stash graph absent"))?;
    let bytes = serde_json::to_vec(graph).map_err(io::Error::other)?;
    version["flattenedEdgesRef"] = json!(crate::validate::hexadecimal(&Sha1::digest(bytes)));
    if let Some(graph) = component.version.get("dependenciesGraph") {
        let serialized =
            graph.as_str().ok_or_else(|| invalid("stash dependency graph serialization"))?;
        let _: Value = serde_json::from_str(serialized).map_err(io::Error::other)?;
        version["dependenciesGraphRef"] =
            json!(crate::validate::hexadecimal(&Sha1::digest(serialized.as_bytes())));
    }

    let sources = capture_files(&mut version, component, snapshots)?;
    objects.push(snapshot::object("Version", Some(&allocation.hash), version.clone())?);
    objects.extend(sources);
    Ok(version)
}
fn capture_files(
    version: &mut Value,
    component: &Component,
    snapshots: &snapshots::State,
) -> io::Result<Vec<Value>> {
    let mut files = Vec::new();
    let mut sources = Vec::new();
    for file in &component.files {
        let (row, source) = sources::capture_file(version, file, snapshots)?;
        files.push(row);
        sources.push(source);
    }
    version["files"] = json!(files);
    Ok(sources)
}

fn base(component: &Component) -> Value {
    let mut fields = Map::new();
    for key in FIELDS {
        if let Some(value) = component.version.get(*key) {
            fields.insert((*key).into(), value.clone());
        }
    }
    if fields
        .get("packageJsonChangedProps")
        .is_none_or(|value| !bit_workspace_config::truthy(value))
    {
        fields.insert("packageJsonChangedProps".into(), json!({}));
    }
    Value::Object(fields)
}

fn validate_log(log: &Value) -> io::Result<()> {
    if !log.is_object() || !log["date"].is_string() {
        return Err(invalid("stash log shape"));
    }
    for field in ["message", "username", "email"] {
        if log
            .get(field)
            .is_some_and(|value| !value.is_string())
        {
            return Err(invalid("stash log field"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

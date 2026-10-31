#[cfg(test)]
mod tests;

use crate::workspace::engine::{
    command::{Record, capture::Captured, materialization, merge_dependency_guard},
    dependency_graph::proof::Proof,
    invalid,
    status_models::harmony,
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, io};

pub(super) fn verify(
    record: &Record,
    captured: &[Captured],
    target: &materialization::Prepared,
    identity: &str,
) -> io::Result<Vec<Proof>> {
    let current = captured
        .iter()
        .find(|current| current.target.identity == identity)
        .ok_or_else(|| invalid("command fast-forward capture"))?;
    metadata(&current.target.current, &current.target.files, &target.version)?;
    merge_dependency_guard::verify(
        &record.request.root,
        &record.request.home,
        current,
        &target.files,
        &record.request.dependency_grammar,
    )
}

// Autosnap reloads all workspace dependency data after materialization. A
// pre-write capture can be rekeyed only when the incoming files have the same
// classification and component policy. Imports are checked against retained
// source bodies separately, without crossing the JavaScript boundary.
pub(super) fn metadata(current: &Value, files: &[String], target: &Value) -> io::Result<()> {
    let target = harmony::project(target)?;
    for field in [
        "mainFile",
        "bindingPrefix",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "overrides",
    ] {
        if current[field] != target[field] {
            return Err(invalid("command fast-forward dependency cache policy changed"));
        }
    }
    for field in ["dependencies", "devDependencies"] {
        crate::workspace::engine::command::merge::equivalent_dependencies(
            &target[field],
            &current[field],
        )?;
    }
    if current["extensions"] != extensions(&target)? {
        return Err(invalid("command fast-forward dependency cache extensions changed"));
    }
    let incoming = incoming_files(&target)?;
    let existing = files
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .collect::<BTreeSet<_>>();
    if incoming != existing {
        return Err(invalid("command fast-forward dependency cache file layout changed"));
    }
    Ok(())
}

fn incoming_files(target: &Value) -> io::Result<BTreeSet<&str>> {
    target["files"]
        .as_array()
        .ok_or_else(|| invalid("command fast-forward files"))?
        .iter()
        .map(|file| {
            file["relativePath"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| invalid("command fast-forward file name"))
        })
        .collect()
}

fn extensions(target: &Value) -> io::Result<Value> {
    let rows = target["extensions"]
        .as_array()
        .ok_or_else(|| invalid("command fast-forward extensions"))?;
    let rows = rows
        .iter()
        .map(|row| {
            let is_envs = crate::workspace::engine::client_status::config::is_extension_aspect(
                row,
                "teambit.envs/envs",
            );
            let non_node_env = row["data"]["id"]
                .as_str()
                .and_then(|id| id.split('@').next())
                != Some("teambit.harmony/node");
            if row.get("extensionId").is_some()
                || row.get("legacyId").is_some()
                || is_envs && non_node_env
            {
                return Err(invalid("command fast-forward dependency cache environment"));
            }
            Ok(json!({"name":row["name"],"config":row.get("config").cloned().unwrap_or_else(|| json!({}))}))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(json!(rows))
}

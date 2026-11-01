#[cfg(test)]
mod tests;

use crate::workspace::engine::{
    command::{Record, capture::Captured, materialization, merge_dependency_guard},
    dependency_graph::proof::Proof,
    invalid,
    status_models::harmony,
};
use serde_json::Value;
use std::{collections::BTreeSet, io};

pub(super) fn verify(
    record: &Record,
    captured: &[Captured],
    target: &materialization::Prepared,
    identity: &str,
) -> io::Result<Vec<Proof>> {
    let identity = identity.trim();
    let current = captured
        .iter()
        .find(|current| current.target.identity.trim() == identity)
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
    validate_extensions(&current["extensions"], &target)?;
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
    let mut set = BTreeSet::new();
    for file in target["files"].as_array().ok_or_else(|| invalid("command fast-forward files"))? {
        let name = file["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("command fast-forward file name"))?;
        crate::checkout::plan::relative_path(name)?;
        if !set.insert(name) {
            return Err(invalid("command fast-forward duplicate file"));
        }
    }
    Ok(set)
}

fn validate_extensions(current: &Value, target: &Value) -> io::Result<()> {
    let rows = target["extensions"]
        .as_array()
        .ok_or_else(|| invalid("command fast-forward extensions"))?;
    for row in rows {
        let non_node_env = crate::workspace::engine::client_status::config::is_extension_aspect(
            row,
            "teambit.envs/envs",
        ) && row["data"]["id"]
            .as_str()
            .map(str::trim)
            .and_then(|id| id.split('@').next())
            .map(str::trim)
            != Some("teambit.harmony/node");
        if row.get("extensionId").is_some() || row.get("legacyId").is_some() || non_node_env {
            return Err(invalid("command fast-forward dependency cache environment"));
        }
    }
    let Some(expected) = current.as_array() else {
        return Err(invalid("command fast-forward dependency cache extensions changed"));
    };
    let matches = rows.len() == expected.len()
        && rows
            .iter()
            .zip(expected)
            .all(|(row, exp)| extension_matches(row, exp));
    if !matches {
        return Err(invalid("command fast-forward dependency cache extensions changed"));
    }
    Ok(())
}

#[inline]
fn extension_matches(row: &Value, exp: &Value) -> bool {
    let Some(obj) = exp.as_object() else { return false };
    if obj.len() != 2 || !obj.contains_key("name") || !obj.contains_key("config") {
        return false;
    }
    let row_cfg = row.get("config");
    let exp_cfg = obj.get("config");
    row["name"] == exp["name"]
        && (row_cfg == exp_cfg
            || (row_cfg.is_none()
                && exp_cfg.and_then(Value::as_object).is_some_and(serde_json::Map::is_empty)))
}

//! The workspace dependency policy an import must leave alone.
use super::super::{config, invalid};
use serde_json::Value;
use std::{collections::HashMap, io, path::Path};

/// `getWorkspacePolicyFromConfig()`: each root policy entry's version.
pub(super) fn workspace_policy(root: &Path) -> io::Result<HashMap<String, String>> {
    let workspace = config::document(&root.join("workspace.jsonc"))?;
    let policy = &workspace["teambit.dependencies/dependency-resolver"]["policy"];
    let mut versions = HashMap::new();
    for lifecycle in ["dependencies", "peerDependencies"] {
        let Some(entries) = policy[lifecycle].as_object() else { continue };
        for (name, value) in entries {
            versions.insert(name.clone(), entry_version(value)?.to_owned());
        }
    }
    Ok(versions)
}

/// A policy entry's version: the string, or the `version` of an object entry.
fn entry_version(value: &Value) -> io::Result<&str> {
    match value {
        Value::String(version) => Ok(version),
        Value::Object(entry) => entry
            .get("version")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("inbound workspace policy entry")),
        _ => Err(invalid("inbound workspace policy entry")),
    }
}

/// `updateDepsInWorkspaceConfig` edits `workspace.jsonc` when an auto-detected
/// dependency of an imported component is in the workspace policy at another
/// version. That edit belongs to the Node.js CLI, so such an import declines.
pub(super) fn reject_update(version: &Value, policy: &HashMap<String, String>) -> io::Result<()> {
    if policy.is_empty() {
        return Ok(());
    }
    let resolver = version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|extension| {
            extension["name"] == "teambit.dependencies/dependency-resolver"
                || extension["extensionId"]["name"] == "teambit.dependencies/dependency-resolver"
        });
    let Some(dependencies) =
        resolver.and_then(|extension| extension["data"]["dependencies"].as_array())
    else {
        return Ok(());
    };
    for dependency in dependencies {
        if dependency["source"] != "auto" {
            continue;
        }
        let name = dependency["packageName"]
            .as_str()
            .or_else(|| {
                (dependency["__type"] == "package")
                    .then(|| dependency["id"].as_str())
                    .flatten()
            });
        let (Some(name), Some(wanted)) = (name, dependency["version"].as_str()) else { continue };
        if policy
            .get(name)
            .is_some_and(|current| current != wanted)
        {
            return Err(invalid("inbound import updates the workspace policy"));
        }
    }
    Ok(())
}

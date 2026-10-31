//! Pending merge configuration (`AspectsMerger.getMergeConfigCombined`),
//! projected without changing merge-conflict or repository state.

use super::super::js::{array, decline, text};
use bit_install::{
    config::{MergeConfig, scope_path},
    policy::scope::read_proof,
};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(in crate::commands::status) fn context(root: &Path, context: &Value) -> io::Result<Value> {
    let input = Inputs::read(root)?;
    let rows = array(Some(&input.unmerged), "unmerged configuration")?;
    let mut output = context.clone();
    for target in array(context.get("targets"), "pending targets")? {
        let identity = text(target.get("identity"))?.trim();
        if let Some(config) = configuration(&input.merge, rows, identity)? {
            output["pendingConfigurations"][identity] = config;
        }
    }
    output["mergeWorkspacePolicy"] = json!(input.merge.workspace_policy()?);
    let mut reads = context["environmentReadSet"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    reads.extend(array(context.get("controlReadSet"), "control proofs")?.iter().cloned());
    reads.extend(input.proofs);
    output["environmentReadSet"] = json!(reads);
    Ok(output)
}

struct Inputs {
    merge: MergeConfig,
    unmerged: Value,
    proofs: Vec<Value>,
}
impl Inputs {
    fn read(root: &Path) -> io::Result<Self> {
        let paths = [root.join("merge-conflict"), scope_path(root).join("unmerged.json")];
        let proofs = paths
            .iter()
            .map(|path| read_proof(path))
            .collect::<io::Result<Vec<_>>>()?;
        let file = optional(&paths[0])?.unwrap_or_default();
        let merge = MergeConfig::parse(&file);
        let unmerged = optional(&paths[1])?
            .map_or_else(
                || Ok(json!([])),
                |text| bit_object_import::parse_jsonc(text.as_bytes()),
            )?;
        Ok(Self { merge, unmerged, proofs })
    }
}

fn configuration(merge: &MergeConfig, rows: &[Value], identity: &str) -> io::Result<Option<Value>> {
    let identity = identity.trim();
    let current = merge
        .raw_component(identity)?
        .unwrap_or_else(|| json!({}));
    let combined = combine(current, unmerged_config(rows, identity));
    let normalized = MergeConfig::parse(&format!("[*] {identity}\n{combined}"));
    Ok(normalized.component(identity)?.map(|component|json!({"config":component.config,"auto":component.auto_deps,"conflict":merge.has_conflict(identity)})))
}

fn optional(path: &Path) -> io::Result<Option<String>> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(decline("status pending configuration file"));
    }
    fs::read_to_string(path).map(Some)
}

fn unmerged_config(rows: &[Value], identity: &str) -> Option<Value> {
    let identity = identity.trim();
    rows.iter()
        .find(|row| {
            super::super::js::without_version(&super::extension_identity(&row["id"])).trim()
                == identity
        })
        .and_then(|row| row.get("mergedConfig"))
        .filter(|config| !config.is_null())
        .cloned()
}

fn combine(mut target: Value, incoming: Option<Value>) -> Value {
    let Some(incoming) = incoming else { return target };
    merge(&mut target, &incoming);
    target
}

/// lodash `mergeWith`: nested objects merge; existing arrays concatenate.
fn merge(target: &mut Value, incoming: &Value) {
    if let (Some(left), Some(right)) = (target.as_array_mut(), incoming.as_array()) {
        left.extend(right.clone());
    } else if let (Some(left), Some(right)) = (target.as_object_mut(), incoming.as_object()) {
        for (name, value) in right {
            match left.get_mut(name) {
                Some(existing) => merge(existing, value),
                None => {
                    left.insert(name.clone(), value.clone());
                }
            }
        }
    } else {
        *target = incoming.clone();
    }
}

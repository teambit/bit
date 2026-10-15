//! `DependencyGraph.getImmediateDependentsPerId` guard for explicit lane resets.

use super::{invalid, outbound};
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::Path};

pub(super) fn validate(root: &Path, identity: &str, removed: &[String]) -> io::Result<()> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("lane dependent identity"))?;
    let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
    let objects = root.join(".bit/objects");
    let removed = removed
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let references = references(&objects, &index)?;
    for reference in references {
        if removed.contains(reference.as_str()) {
            continue;
        }
        let version = outbound::read_object(&objects, &reference, "Version")?;
        if uses_removed(&version, scope, name, &removed) {
            return Err(invalid("lane reset version has a dependent"));
        }
    }
    Ok(())
}

fn references(objects: &Path, index: &Value) -> io::Result<HashSet<String>> {
    let mut refs = HashSet::new();
    let components =
        index["components"].as_array().ok_or_else(|| invalid("lane dependent components"))?;
    for row in components {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("lane dependent component hash"))?;
        let model = outbound::read_object(objects, hash, "Component")?;
        model_refs(&model, &mut refs)?;
    }
    let lanes = index["lanes"].as_array().ok_or_else(|| invalid("lane dependent lanes"))?;
    for row in lanes {
        let hash = row["hash"].as_str().ok_or_else(|| invalid("lane dependent lane hash"))?;
        let lane = outbound::read_object(objects, hash, "Lane")?;
        lane_refs(&lane, &mut refs)?;
    }
    if refs.len() > 32768 {
        return Err(invalid("lane dependent reference limit"));
    }
    Ok(refs)
}

fn model_refs(model: &Value, refs: &mut HashSet<String>) -> io::Result<()> {
    let versions =
        model["versions"].as_object().ok_or_else(|| invalid("lane dependent versions"))?;
    refs.extend(
        versions
            .values()
            .filter_map(Value::as_str)
            .map(str::to_owned),
    );
    if let Some(head) = model["head"].as_str() {
        refs.insert(head.to_owned());
    }
    if let Some(local) = model["state"]["versions"].as_object() {
        refs.extend(
            local
                .keys()
                .filter(|key| crate::merge_history::hash(key).is_ok())
                .cloned(),
        );
    }
    Ok(())
}

fn lane_refs(lane: &Value, refs: &mut HashSet<String>) -> io::Result<()> {
    let components =
        lane["components"].as_array().ok_or_else(|| invalid("lane dependent lane rows"))?;
    for row in components {
        let head = row["head"].as_str().ok_or_else(|| invalid("lane dependent lane head"))?;
        refs.insert(head.to_owned());
    }
    Ok(())
}

fn uses_removed(version: &Value, scope: &str, name: &str, removed: &HashSet<&str>) -> bool {
    ["dependencies", "devDependencies", "peerDependencies", "extensionDependencies"]
        .into_iter()
        .filter_map(|field| version[field].as_array())
        .flatten()
        .any(|dependency| {
            let id = &dependency["id"];
            id["scope"] == scope
                && id["name"] == name
                && id["version"]
                    .as_str()
                    .is_some_and(|reference| removed.contains(reference))
        })
}

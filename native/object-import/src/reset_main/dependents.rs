//! `DependencyGraph.getImmediateDependentsPerId` guard for a local reset.

use super::{invalid, outbound, selection::Selection};
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

pub(super) fn validate(
    objects: &Path,
    components: &[Value],
    identity: &str,
    selection: &Selection,
    selected_model: &Value,
) -> io::Result<()> {
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("reset identity"))?;
    let removed: HashSet<_> = selection.removed
        .iter()
        .chain(&selection.labels)
        .map(String::as_str)
        .collect();
    for row in components {
        validate_row(objects, row, scope, name, &removed, selected_model)?;
    }
    Ok(())
}

fn validate_row(
    objects: &Path,
    row: &Value,
    scope: &str,
    name: &str,
    removed: &HashSet<&str>,
    selected_model: &Value,
) -> io::Result<()> {
    let same = row["id"]["scope"] == scope && row["id"]["name"] == name;
    let component = component_model(objects, row, same, selected_model)?;
    for reference in references(&component)? {
        if same && removed.contains(reference.as_str()) {
            continue;
        }
        let version = outbound::read_object(objects, &reference, "Version")?;
        if uses_removed(&version, scope, name, removed) {
            return Err(invalid("reset version has a dependent"));
        }
    }
    Ok(())
}

fn component_model(objects: &Path, row: &Value, same: bool, selected: &Value) -> io::Result<Value> {
    if same {
        return Ok(selected.clone());
    }
    let hash = row["hash"].as_str().ok_or_else(|| invalid("reset dependent index hash"))?;
    outbound::read_object(objects, hash, "Component")
}

fn references(component: &Value) -> io::Result<HashSet<String>> {
    let versions =
        component["versions"].as_object().ok_or_else(|| invalid("reset dependent versions"))?;
    let mut refs: HashSet<_> = versions
        .values()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    if let Some(head) = component["head"].as_str() {
        refs.insert(head.to_owned());
    }
    if let Some(local) = component["state"]["versions"].as_object() {
        for label in local
            .keys()
            .filter(|label| crate::merge_history::hash(label).is_ok())
        {
            refs.insert(label.clone());
        }
    }
    Ok(refs)
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
                    .is_some_and(|version| removed.contains(version))
        })
}

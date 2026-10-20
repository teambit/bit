//! The all-version reverse dependency graph used by `Scope.getDependentsBitIds`.

use super::{hash, invalid, readset::Readset};
use indexmap::{IndexMap, IndexSet};
use serde_json::{Value, json};
use std::{collections::VecDeque, io};

type Reverse = IndexMap<String, IndexSet<String>>;

pub(super) fn dependents(
    readset: &mut Readset,
    index: &Value,
    found: &[(String, Value, String)],
) -> io::Result<Value> {
    let reverse = build_reverse(readset, index)?;
    let mut result = serde_json::Map::new();
    for (identity, _, _) in found {
        let related = collect(&reverse, identity);
        if !related.is_empty() {
            result.insert(identity.clone(), json!(related));
        }
    }
    Ok(Value::Object(result))
}

fn build_reverse(readset: &mut Readset, index: &Value) -> io::Result<Reverse> {
    let mut reverse = Reverse::new();
    for row in index["components"].as_array().ok_or_else(|| invalid("component index"))? {
        if row["isSymlink"] == true {
            continue;
        }
        let Some(identity) = row_identity(row) else {
            return Err(invalid("component index identity"));
        };
        let model = readset.read(hash(&row["hash"])?, "Component")?;
        add_component(readset, &identity, &model, &mut reverse)?;
    }
    Ok(reverse)
}

fn add_component(
    readset: &mut Readset,
    identity: &str,
    model: &Value,
    reverse: &mut Reverse,
) -> io::Result<()> {
    let Some(head) = model["laneHeadLocal"]
        .as_str()
        .or_else(|| model["head"].as_str())
    else {
        return Ok(());
    };
    let mut queue = VecDeque::from([head.to_owned()]);
    let mut seen = IndexSet::new();
    while let Some(version_hash) = queue.pop_front() {
        if !seen.insert(version_hash.clone()) {
            continue;
        }
        let version = match readset.read(&version_hash, "Version") {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        let label = tag(model, &version_hash).unwrap_or(&version_hash);
        let node = format!("{identity}@{label}");
        record_dependencies(reverse, &node, &version);
        enqueue_parents(&mut queue, &version)?;
    }
    Ok(())
}

fn record_dependencies(reverse: &mut Reverse, node: &str, version: &Value) {
    reverse.entry(node.to_owned()).or_default();
    for dependency in dependencies(version) {
        reverse
            .entry(dependency)
            .or_default()
            .insert(node.to_owned());
    }
}

fn enqueue_parents(queue: &mut VecDeque<String>, version: &Value) -> io::Result<()> {
    for parent in version["parents"]
        .as_array()
        .into_iter()
        .flatten()
    {
        queue.push_back(hash(parent)?.to_owned());
    }
    Ok(())
}

fn tag<'a>(model: &'a Value, version_hash: &str) -> Option<&'a str> {
    ["versions", "orphanedVersions"]
        .iter()
        .find_map(|name| {
            model[*name]
                .as_object()?
                .iter()
                .rev()
                .find_map(|(label, value)| {
                    (value.as_str() == Some(version_hash)).then_some(label.as_str())
                })
        })
}

fn collect(reverse: &Reverse, identity: &str) -> Vec<String> {
    let mut pending = reverse
        .keys()
        .filter(|node| {
            node.split_once('@')
                .is_some_and(|(name, _)| name == identity)
        })
        .cloned()
        .collect::<VecDeque<_>>();
    let mut visited = IndexSet::new();
    let mut dependents = IndexSet::new();
    while let Some(node) = pending.pop_front() {
        if !visited.insert(node.clone()) {
            continue;
        }
        let Some(next) = reverse.get(&node) else { continue };
        extend_dependents(next, &node, &mut pending, &mut dependents);
    }
    dependents.into_iter().collect()
}

fn extend_dependents(
    next: &IndexSet<String>,
    node: &str,
    pending: &mut VecDeque<String>,
    dependents: &mut IndexSet<String>,
) {
    for parent in next {
        if parent != node {
            let name = parent.split_once('@').map_or(parent.as_str(), |(name, _)| name);
            dependents.insert(name.to_owned());
        }
        pending.push_back(parent.to_owned());
    }
}

fn row_identity(row: &Value) -> Option<String> {
    Some(format!("{}/{}", row["id"]["scope"].as_str()?, row["id"]["name"].as_str()?))
}

fn dependencies(version: &Value) -> Vec<String> {
    let mut result = Vec::new();
    for group in ["dependencies", "devDependencies", "peerDependencies"] {
        result.extend(
            version[group]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|row| id(&row["id"])),
        );
    }
    result.extend(
        version["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|row| id(&row["extensionId"])),
    );
    result
}

fn id(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_owned());
    }
    let scope = value["scope"].as_str()?;
    let name = value["name"].as_str()?;
    let version = value["version"].as_str();
    Some(version.map_or_else(
        || format!("{scope}/{name}"),
        |version| format!("{scope}/{name}@{version}"),
    ))
}

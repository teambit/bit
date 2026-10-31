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
    for row in index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("component index"))?
    {
        if row["isSymlink"] == true {
            continue;
        }
        let model = readset.read(hash(&row["hash"])?, "Component")?;
        let Some(identity) = row_identity(row, &model) else {
            return Err(invalid("component index identity"));
        };
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
    let tags = crate::tag_index::TagIndex::model(model);
    while let Some(version_hash) = queue.pop_front() {
        if !seen.insert(version_hash.clone()) {
            continue;
        }
        let version = match readset.read(&version_hash, "Version") {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        let label = tags.get(&version_hash).map_or(version_hash.as_str(), |(label, _)| label);
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

fn row_identity(row: &Value, model: &Value) -> Option<String> {
    let (row_scope, row_name) = super::row_id_parts(&row["id"]);
    let scope = (!row_scope.is_empty())
        .then_some(row_scope)
        .or_else(|| {
            model["scope"]
                .as_str()
                .filter(|val| !val.is_empty())
        })?;
    let name = (!row_name.is_empty())
        .then_some(row_name)
        .or_else(|| {
            model["name"]
                .as_str()
                .filter(|val| !val.is_empty())
        })?;
    Some(format!("{scope}/{name}"))
}

fn dependencies(version: &Value) -> Vec<String> {
    let mut result = Vec::new();
    for group in ["dependencies", "devDependencies", "peerDependencies", "extensionDependencies"] {
        result.extend(
            version[group]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(id),
        );
    }
    result.extend(
        version["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|row| id(&row["extensionId"]).or_else(|| id(row))),
    );
    result
}

fn id(value: &Value) -> Option<String> {
    if let Some(text) = value
        .as_str()
        .or_else(|| value["id"].as_str())
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_owned());
    }
    let id_obj = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = id_obj["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .filter(|scope| !scope.is_empty())?;
    let raw_name = id_obj["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .filter(|name| !name.is_empty())?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| {
            (bare, Some(ver).filter(|ver| !ver.is_empty() && !matches!(*ver, "latest" | "head")))
        });
    let version = id_obj["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        .or(inline_ver);
    Some(version.map_or_else(
        || format!("{scope}/{name}"),
        |version| format!("{scope}/{name}@{version}"),
    ))
}

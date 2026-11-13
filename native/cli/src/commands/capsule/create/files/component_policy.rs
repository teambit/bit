//! Component-level `teambit.dependencies/dependency-resolver` policy from `component.json` for capsule manifests.
//!
//! Only plain `policy.{dependencies,devDependencies,peerDependencies}` string maps are supported; any other
//! `component.json` content makes [`read`] return `None` so the command delegates to the released CLI.

use super::{BitmapEntry, PackageDependencies};
use serde_json::{Map, Value};
use std::{fs, path::Path};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];

/// Component-level dependency policy entries layered over a capsule manifest's dependency maps.
#[derive(Default)]
pub(super) struct ComponentPolicy {
    dependencies: Map<String, Value>,
    dev_dependencies: Map<String, Value>,
    peer_dependencies: Map<String, Value>,
}

/// Reads the supported policy of `entry`; `Some(default)` without a `component.json`, `None` when unsupported.
pub(super) fn read(ws_root: &Path, entry: &BitmapEntry) -> Option<ComponentPolicy> {
    if entry.root_dir.is_empty() {
        return Some(ComponentPolicy::default());
    }
    let path = ws_root.join(&entry.root_dir).join("component.json");
    if !path.exists() {
        return Some(ComponentPolicy::default());
    }
    let json: Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    parse(&json)
}

fn parse(json: &Value) -> Option<ComponentPolicy> {
    let root = json.as_object()?;
    if root
        .keys()
        .any(|key| {
            !matches!(key.as_str(), "componentId" | "propagate" | "defaultScope" | "extensions")
        })
    {
        return None;
    }
    let extensions = root.get("extensions")?.as_object()?;
    if extensions
        .keys()
        .any(|key| key != RESOLVER)
    {
        return None;
    }
    extensions
        .get(RESOLVER)
        .map_or_else(|| Some(ComponentPolicy::default()), parse_resolver)
}

fn parse_resolver(config: &Value) -> Option<ComponentPolicy> {
    let config = config.as_object()?;
    if config.keys().any(|key| key != "policy") {
        return None;
    }
    let policy = config.get("policy")?.as_object()?;
    if policy
        .keys()
        .any(|key| !FIELDS.contains(&key.as_str()))
    {
        return None;
    }
    let mut maps = FIELDS.map(|field| string_map(policy.get(field)));
    let unique = maps
        .iter()
        .flatten()
        .flat_map(Map::keys)
        .collect::<std::collections::BTreeSet<_>>();
    if maps.iter().any(Option::is_none)
        || unique.len()
            != maps
                .iter()
                .flatten()
                .map(Map::len)
                .sum::<usize>()
    {
        return None;
    }
    let [dependencies, dev_dependencies, peer_dependencies] = maps
        .each_mut()
        .map(|map| map.take().unwrap_or_default());
    Some(ComponentPolicy { dependencies, dev_dependencies, peer_dependencies })
}

fn string_map(value: Option<&Value>) -> Option<Map<String, Value>> {
    let Some(value) = value else { return Some(Map::new()) };
    let map = value.as_object()?;
    map.values()
        .all(Value::is_string)
        .then(|| map.clone())
}

/// Layers `policy` over `base`, with component-level entries taking precedence.
pub(super) fn apply(
    policy: &ComponentPolicy,
    mut base: PackageDependencies,
) -> PackageDependencies {
    for (target, source) in [
        (&mut base.dependencies, &policy.dependencies),
        (&mut base.dev_dependencies, &policy.dev_dependencies),
        (&mut base.peer_dependencies, &policy.peer_dependencies),
    ] {
        target.extend(
            source
                .iter()
                .map(|(name, ver)| (name.clone(), ver.clone())),
        );
    }
    base
}

#[cfg(test)]
mod tests;

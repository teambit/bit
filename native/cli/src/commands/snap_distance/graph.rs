//! Graph traversal and lowest-common-ancestor helpers for `bit snap-distance`.

use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
};

pub(super) fn compute_snap_distance(vh_val: &Value, source: &str, target: &str) -> Option<Value> {
    let parents_map = build_parents_map(vh_val)?;
    if !parents_map.contains_key(source) || !parents_map.contains_key(target) {
        return None;
    }
    if source == target {
        return Some(json!({ "snapsOnSourceOnly": [], "snapsOnTargetOnly": [] }));
    }
    let source_arr = collect_successors(&parents_map, source)?;
    let target_arr = collect_successors(&parents_map, target)?;
    let target_set: HashSet<&str> = target_arr.iter().copied().collect();
    let source_set: HashSet<&str> = source_arr.iter().copied().collect();
    let common_snaps: Vec<&str> = source_arr
        .iter()
        .copied()
        .filter(|snap| target_set.contains(snap))
        .collect();
    let closest_common = find_closest_common(&parents_map, source, target, &common_snaps)?;
    let on_source_only: Vec<_> = source_arr
        .into_iter()
        .filter(|snap| !target_set.contains(snap))
        .map(|snap| json!({"hash": snap}))
        .collect();
    let on_target_only: Vec<_> = target_arr
        .into_iter()
        .filter(|snap| !source_set.contains(snap))
        .map(|snap| json!({"hash": snap}))
        .collect();
    Some(json!({
        "snapsOnSourceOnly": on_source_only,
        "snapsOnTargetOnly": on_target_only,
        "commonSnapBeforeDiverge": { "hash": closest_common },
    }))
}

pub(super) fn build_parents_map(vh_val: &Value) -> Option<HashMap<&str, Vec<&str>>> {
    let versions = vh_val["versions"].as_array()?;
    let mut parents_map = HashMap::with_capacity(versions.len());
    for entry in versions {
        let hash = entry["hash"]
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())?;
        let parents = match entry.get("parents") {
            None | Some(Value::Null) => Vec::new(),
            Some(Value::Array(arr)) => arr
                .iter()
                .map(parent_hash)
                .collect::<Option<Vec<_>>>()?,
            _ => return None,
        };
        parents_map.insert(hash, parents);
    }
    Some(parents_map)
}

fn parent_hash(parent: &Value) -> Option<&str> {
    parent
        .as_str()
        .or_else(|| parent.get("hash").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn find_closest_common<'a>(
    parents_map: &HashMap<&'a str, Vec<&'a str>>,
    source: &'a str,
    target: &'a str,
    common_snaps: &[&'a str],
) -> Option<&'a str> {
    if let [single] = common_snaps {
        return Some(*single);
    }
    if common_snaps.is_empty() {
        return None;
    }
    let common_set: HashSet<&str> = common_snaps.iter().copied().collect();
    let closest_source = bfs_first(parents_map, source, &common_set)?;
    let closest_target = bfs_first(parents_map, target, &common_set)?;
    if closest_source == closest_target {
        return Some(closest_source);
    }
    let source_succ = collect_successors(parents_map, closest_source)?;
    Some(if source_succ.contains(&closest_target) { closest_source } else { closest_target })
}

pub(super) fn collect_successors<'a>(
    parents_map: &HashMap<&'a str, Vec<&'a str>>,
    start: &'a str,
) -> Option<Vec<&'a str>> {
    let mut visited = HashSet::new();
    let mut result = Vec::new();
    let mut stack = vec![start];
    while let Some(curr) = stack.pop() {
        if !visited.insert(curr) {
            continue;
        }
        result.push(curr);
        push_unvisited_parents(parents_map, curr, &visited, &mut stack)?;
    }
    Some(result)
}

fn push_unvisited_parents<'a>(
    parents_map: &HashMap<&'a str, Vec<&'a str>>,
    curr: &'a str,
    visited: &HashSet<&'a str>,
    stack: &mut Vec<&'a str>,
) -> Option<()> {
    for &parent in parents_map.get(curr)?.iter().rev() {
        if !parents_map.contains_key(parent) {
            return None;
        }
        if !visited.contains(parent) {
            stack.push(parent);
        }
    }
    Some(())
}

fn bfs_first<'a>(
    parents_map: &HashMap<&'a str, Vec<&'a str>>,
    start: &'a str,
    targets: &HashSet<&'a str>,
) -> Option<&'a str> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::from([start]);
    while let Some(curr) = queue.pop_front() {
        if !visited.insert(curr) {
            continue;
        }
        if targets.contains(curr) {
            return Some(curr);
        }
        for &parent in parents_map.get(curr)? {
            queue.push_back(parent);
        }
    }
    None
}

pub(super) fn load_version_history_with_local_versions(
    scope_dir: &Path,
    vh_hash: &str,
    heads: &[&str],
) -> Option<Value> {
    let mut versions = match bit_object_import::read_scope_object(scope_dir, vh_hash) {
        Ok(Some((kind, val))) if kind == "VersionHistory" => val["versions"].as_array()?.clone(),
        Ok(None) => Vec::new(),
        _ => return None,
    };
    let mut known: HashSet<String> = versions
        .iter()
        .filter_map(|ver| ver["hash"].as_str().map(str::to_owned))
        .collect();
    let mut stack: Vec<String> = heads
        .iter()
        .map(|&head| head.to_owned())
        .collect();
    while let Some(hash) = stack.pop() {
        if known.contains(&hash) {
            continue;
        }
        let parents = read_version_parents(scope_dir, &hash)?;
        for parent in &parents {
            if !known.contains(parent) {
                stack.push(parent.clone());
            }
        }
        known.insert(hash.clone());
        versions.push(json!({ "hash": hash, "parents": parents }));
    }
    Some(json!({ "versions": versions }))
}

fn read_version_parents(scope_dir: &Path, hash: &str) -> Option<Vec<String>> {
    let (kind, ver) = bit_object_import::read_scope_object(scope_dir, hash).ok()??;
    if kind != "Version" {
        return None;
    }
    Some(
        ver["parents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(parent_hash)
            .map(str::to_owned)
            .collect(),
    )
}

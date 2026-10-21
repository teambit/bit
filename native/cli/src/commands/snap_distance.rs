//! Native `bit snap-distance <component-id> [source-snap] [target-snap]` (`scopes/component/snapping/snap-distance-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    debug_cat::{emit_text, lookup::resolve_component_entry, scope_dir_for, sha1_hex},
    lane::scope_root,
    workspace_command,
};
use crate::native::Outcome;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    ffi::OsString,
    io,
    path::Path,
};

pub const COMMAND: Command = Command { name: "snap-distance", aliases: &[], run };

#[derive(Debug, PartialEq, Eq)]
struct Options {
    id: String,
    source_snap: String,
    target_snap: String,
}

fn is_hex40(text: &str) -> bool {
    text.len() == 40 && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let mut positional = Vec::new();
    for &arg in args {
        match arg {
            "--no-color" => {}
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
        }
    }
    let [id, source_snap, target_snap] = positional.as_slice() else {
        return None;
    };
    if id.is_empty() || !is_hex40(source_snap) || !is_hex40(target_snap) {
        return None;
    }
    Some(Options {
        id: (*id).to_owned(),
        source_snap: (*source_snap).to_owned(),
        target_snap: (*target_snap).to_owned(),
    })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("snap-distance arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native snap-distance grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("snap-distance requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let (bare_id, _) = opts.id
        .rsplit_once('@')
        .unwrap_or((&opts.id, ""));
    let Some((Some(scope), name, _)) = resolve_component_entry(&scope_dir, bare_id) else {
        return Ok(Outcome::Declined("snap-distance component lookup delegated".into()));
    };
    let vh_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let Some(vh_val) = load_version_history_with_local_versions(
        &scope_dir,
        &vh_hash,
        &opts.source_snap,
        &opts.target_snap,
    ) else {
        return Ok(Outcome::Declined("snap-distance VersionHistory missing".into()));
    };
    let Some(result) = compute_snap_distance(&vh_val, &opts.source_snap, &opts.target_snap) else {
        return Ok(Outcome::Declined("snap-distance delegated".into()));
    };
    let data = serde_json::to_string_pretty(&result)?;
    emit_text(&root, args, "snap-distance", true, data)
}

fn load_version_history_with_local_versions(
    scope_dir: &Path,
    vh_hash: &str,
    source_snap: &str,
    target_snap: &str,
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
    let mut stack = vec![source_snap.to_owned(), target_snap.to_owned()];
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
            .map(|arr| {
                arr.iter()
                    .filter_map(|parent| parent.as_str().map(str::to_owned))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
    )
}

fn compute_snap_distance(vh_val: &Value, source: &str, target: &str) -> Option<Value> {
    let parents_map = build_parents_map(vh_val)?;
    if !parents_map.contains_key(source) || !parents_map.contains_key(target) {
        return None;
    }
    if source == target {
        return Some(json!({
            "snapsOnSourceOnly": [],
            "snapsOnTargetOnly": [],
        }));
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
    let on_source_only = source_arr
        .into_iter()
        .filter(|snap| !target_set.contains(snap))
        .map(|snap| json!({"hash": snap}))
        .collect::<Vec<_>>();
    let on_target_only = target_arr
        .into_iter()
        .filter(|snap| !source_set.contains(snap))
        .map(|snap| json!({"hash": snap}))
        .collect::<Vec<_>>();
    Some(json!({
        "snapsOnSourceOnly": on_source_only,
        "snapsOnTargetOnly": on_target_only,
        "commonSnapBeforeDiverge": { "hash": closest_common },
    }))
}

fn build_parents_map(vh_val: &Value) -> Option<HashMap<&str, Vec<&str>>> {
    let versions = vh_val["versions"].as_array()?;
    let mut parents_map = HashMap::with_capacity(versions.len());
    for entry in versions {
        let hash = entry["hash"].as_str()?;
        let parents = entry["parents"]
            .as_array()?
            .iter()
            .map(Value::as_str)
            .collect::<Option<Vec<_>>>()?;
        parents_map.insert(hash, parents);
    }
    Some(parents_map)
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

fn collect_successors<'a>(
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

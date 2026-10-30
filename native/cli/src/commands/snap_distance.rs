//! Native `bit snap-distance <component-id> [source-snap] [target-snap]` (`scopes/component/snapping/snap-distance-cmd.ts`).

mod graph;
#[cfg(test)]
mod tests;

use self::graph::{build_parents_map, collect_successors, compute_snap_distance};
use super::{
    Command,
    color::Chalk,
    debug_cat::{
        emit_failure, emit_scope_not_found, emit_text,
        lookup::{diagnose_component_lookup_error, resolve_component_entry},
        scope_dir_for, sha1_hex,
    },
    graph_cmd::builder::resolve_ver_hash,
    lane::scope_root::{self, ScopeRoot},
    workspace_command,
};
use crate::native::Outcome;
use serde_json::{Value, json};
use std::{collections::HashSet, env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "snap-distance", aliases: &[], run };

#[derive(Debug, PartialEq, Eq)]
struct Options {
    id: String,
    source_snap: Option<String>,
    target_snap: Option<String>,
}

fn is_hex40(text: &str) -> bool {
    text.len() == 40 && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let mut positional = Vec::new();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_snaps(iter, &mut positional)?;
                break;
            }
            "--no-color" => {}
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
        }
    }
    match positional.as_slice() {
        [id] if !id.is_empty() => {
            Some(Options { id: (*id).to_owned(), source_snap: None, target_snap: None })
        }
        [id, source_snap] if !id.is_empty() && !source_snap.is_empty() => Some(Options {
            id: (*id).to_owned(),
            source_snap: Some((*source_snap).to_owned()),
            target_snap: None,
        }),
        [id, source_snap, target_snap]
            if !id.is_empty() && is_hex40(source_snap) && is_hex40(target_snap) =>
        {
            Some(Options {
                id: (*id).to_owned(),
                source_snap: Some((*source_snap).to_owned()),
                target_snap: Some((*target_snap).to_owned()),
            })
        }
        _ => None,
    }
}

fn consume_trailing_snaps<'a>(
    iter: impl Iterator<Item = &'a str>,
    positional: &mut Vec<&'a str>,
) -> Option<()> {
    for rest in iter {
        if rest.starts_with('-') {
            return None;
        }
        positional.push(rest);
    }
    Some(())
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("snap-distance arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native snap-distance grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return emit_scope_not_found(args, "snap-distance", false);
    };
    let scope_dir = scope_dir_for(&root);
    let bare = opts.id.rsplit_once('@').map_or(opts.id.as_str(), |(id, _)| id);
    if resolve_component_entry(&scope_dir, bare).is_none_or(|(sc, _, _)| sc.is_none()) {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) =
                diagnose_component_lookup_error(&scope_dir, &opts.id, bare, Chalk::detect(args))
        {
            return emit_failure(&root, args, "snap-distance", true, false, err);
        }
        return Ok(Outcome::Declined("snap-distance component lookup delegated".into()));
    }
    if opts.source_snap.is_some() && opts.target_snap.is_none() {
        return emit_missing_target_error(&root, args);
    }
    let Some(result) = evaluate_snap_distance(&root, &opts) else {
        return Ok(Outcome::Declined("snap-distance delegated".into()));
    };
    let data = serde_json::to_string_pretty(&result)?;
    emit_text(&root, args, "snap-distance", true, data)
}

fn evaluate_snap_distance(root: &ScopeRoot, opts: &Options) -> Option<Value> {
    let scope_dir = scope_dir_for(root);
    let bare_id = opts.id.rsplit_once('@').map_or(opts.id.as_str(), |(id, _)| id);
    let (Some(scope), name, comp_hash) = resolve_component_entry(&scope_dir, bare_id)? else {
        return None;
    };
    let vh_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    match (&opts.source_snap, &opts.target_snap) {
        (Some(source), Some(target)) => {
            let vh_val = load_version_history_with_local_versions(
                &scope_dir,
                &vh_hash,
                &[source.as_str(), target.as_str()],
            )?;
            compute_snap_distance(&vh_val, source, target)
        }
        (None, None) => {
            compute_local_remote_distance(root, &scope_dir, &scope, &name, &comp_hash, &vh_hash)
        }
        _ => None,
    }
}

fn emit_missing_target_error(root: &ScopeRoot, args: &[OsString]) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI snap-distance error stack".into()));
    }
    emit_failure(
        root,
        args,
        "snap-distance",
        true,
        false,
        "either provide both source and target snaps or none".into(),
    )
}

fn compute_local_remote_distance(
    root: &ScopeRoot,
    scope_dir: &Path,
    scope: &str,
    name: &str,
    comp_hash: &str,
    vh_hash: &str,
) -> Option<Value> {
    let ws_ver = if root.bare {
        None
    } else {
        let bytes = fs::read(root.path.join(".bitmap")).ok()?;
        let bitmap = bit_object_import::parse_jsonc(&bytes).ok()?;
        if !bitmap["_bit_lane"].is_null() && bitmap["_bit_lane"]["id"]["name"] != "main" {
            return None;
        }
        find_bitmap_version(&bitmap, scope, name)
    };
    let (kind, model) = bit_object_import::read_scope_object(scope_dir, comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let local_head = ws_ver
        .as_deref()
        .and_then(|ver| resolve_ver_hash(&model, ver))
        .or_else(|| model["head"].as_str().map(str::to_owned));
    let remote_head = read_remote_main_head(scope_dir, scope, name)?;
    distance_from_heads(scope_dir, vh_hash, local_head.as_deref(), remote_head.as_deref())
}

pub(super) fn is_component_staged_on_main(
    root: &Path,
    scope: &str,
    name: &str,
    ws_version: &str,
) -> Option<bool> {
    let scope_dir = bit_object_import::scope_path(root);
    let (_, _, comp_hash) = resolve_component_entry(&scope_dir, &format!("{scope}/{name}"))?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let local_head = resolve_ver_hash(&model, ws_version)?;
    let (v_kind, _) = bit_object_import::read_scope_object(&scope_dir, &local_head).ok()??;
    if v_kind != "Version" {
        return None;
    }
    let remote_head = read_remote_main_head(&scope_dir, scope, name)?;
    let vh_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let dist =
        distance_from_heads(&scope_dir, &vh_hash, Some(&local_head), remote_head.as_deref())?;
    Some(!dist["snapsOnSourceOnly"].as_array()?.is_empty())
}

pub(super) fn is_component_staged_on_lane(
    root: &Path,
    bitmap_val: &Value,
    scope: &str,
    name: &str,
    ws_version: &str,
) -> Option<bool> {
    let scope_dir = bit_object_import::scope_path(root);
    let (_, _, comp_hash) = resolve_component_entry(&scope_dir, &format!("{scope}/{name}"))?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let local_head = resolve_ver_hash(&model, ws_version)?;
    let (v_kind, _) = bit_object_import::read_scope_object(&scope_dir, &local_head).ok()??;
    if v_kind != "Version" {
        return None;
    }
    let lane_scope = bitmap_val["_bit_lane"]["id"]["scope"].as_str()?;
    let lane_name = bitmap_val["_bit_lane"]["id"]["name"].as_str()?;
    if let Some(remote_lane_head) =
        read_remote_lane_head(&scope_dir, lane_scope, lane_name, scope, name)?
    {
        return Some(remote_lane_head != local_head);
    }
    let remote_main = read_remote_main_head(&scope_dir, scope, name)?;
    Some(remote_main.as_deref() != Some(local_head.as_str()))
}

fn read_remote_lane_head(
    scope_dir: &Path,
    lane_scope: &str,
    lane_name: &str,
    comp_scope: &str,
    comp_name: &str,
) -> Option<Option<String>> {
    let path = scope_dir
        .join("refs")
        .join("remote")
        .join(lane_scope)
        .join(lane_name);
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Some(None),
        Err(_) => return None,
    };
    let entries: Value = serde_json::from_slice(&bytes).ok()?;
    for item in entries.as_array()? {
        if item["id"]["scope"].as_str() == Some(comp_scope)
            && item["id"]["name"].as_str() == Some(comp_name)
        {
            return Some(
                item["head"]
                    .as_str()
                    .filter(|head| !head.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    Some(None)
}

fn distance_from_heads(
    scope_dir: &Path,
    vh_hash: &str,
    local_head: Option<&str>,
    remote_head: Option<&str>,
) -> Option<Value> {
    match (local_head, remote_head) {
        (None, None) => Some(json!({ "snapsOnSourceOnly": [], "snapsOnTargetOnly": [] })),
        (Some(lh), Some(rh)) if lh == rh => {
            Some(json!({ "snapsOnSourceOnly": [], "snapsOnTargetOnly": [] }))
        }
        (Some(lh), Some(rh)) => {
            let vh = load_version_history_with_local_versions(scope_dir, vh_hash, &[lh, rh])?;
            compute_snap_distance(&vh, lh, rh)
        }
        (Some(lh), None) => {
            let snaps = collect_head_hashes(scope_dir, vh_hash, lh)?;
            Some(json!({ "snapsOnSourceOnly": snaps, "snapsOnTargetOnly": [] }))
        }
        (None, Some(rh)) => {
            let snaps = collect_head_hashes(scope_dir, vh_hash, rh)?;
            Some(json!({ "snapsOnSourceOnly": [], "snapsOnTargetOnly": snaps }))
        }
    }
}

fn collect_head_hashes(scope_dir: &Path, vh_hash: &str, head: &str) -> Option<Vec<Value>> {
    let vh = load_version_history_with_local_versions(scope_dir, vh_hash, &[head])?;
    let parents_map = build_parents_map(&vh)?;
    let snaps = collect_successors(&parents_map, head)?;
    Some(
        snaps
            .into_iter()
            .map(|snap| json!({ "hash": snap }))
            .collect(),
    )
}

fn find_bitmap_version(bitmap: &Value, scope: &str, name: &str) -> Option<String> {
    let full = format!("{scope}/{name}");
    for (key, row) in bitmap.as_object()? {
        if key == "$schema-version" || key == "_bit_lane" || !row.is_object() {
            continue;
        }
        let row_name = row["name"].as_str().unwrap_or(key);
        let row_scope = row["scope"]
            .as_str()
            .filter(|val| !val.is_empty())
            .or_else(|| row["defaultScope"].as_str())
            .unwrap_or_default();
        if row_name == name && (row_scope.is_empty() || row_scope == scope || key == &full) {
            return row["version"]
                .as_str()
                .filter(|ver| !ver.is_empty())
                .map(str::to_owned);
        }
    }
    None
}

fn read_remote_main_head(scope_dir: &Path, scope: &str, name: &str) -> Option<Option<String>> {
    let path = scope_dir
        .join("refs")
        .join("remote")
        .join(scope)
        .join("main");
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Some(None),
        Err(_) => return None,
    };
    let entries: Value = serde_json::from_slice(&bytes).ok()?;
    for item in entries.as_array()? {
        if item["id"]["scope"].as_str() == Some(scope) && item["id"]["name"].as_str() == Some(name)
        {
            return Some(
                item["head"]
                    .as_str()
                    .filter(|head| !head.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    Some(None)
}

fn load_version_history_with_local_versions(
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
        .map(|&h| h.to_owned())
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
    (kind == "Version").then(|| {
        ver["parents"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|parent| parent.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default()
    })
}

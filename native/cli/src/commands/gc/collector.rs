//! Garbage collection root seeding and a write-free plan for `bit gc`.
mod publication;

use super::{
    Options,
    format::{DeletedTypeStats, GcDeletionStats, GcDirSizes, GcResult, GcRunFlags},
    graph::{CompIdSpec, GcGraph, comp_value_key, parse_dep_value, resolve_comp_version_ref},
    inventory::{ObjectEntry, ScopeInventory, load_scope_inventory},
    parse_keep_versions,
};
use crate::commands::aspect::workspace_default_scope;
use bit_install::workspace::Bitmap;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

const RECENT_WRITE_MARGIN_MS: u64 = 5 * 60 * 1000;

type CompHeadList = Vec<(String, String)>;

pub(super) struct Plan {
    pub result: GcResult,
    versions: Vec<String>,
    sources: Vec<String>,
    stray: Vec<PathBuf>,
}

pub(super) fn prepare_workspace_garbage(
    root: &Path,
    scope_dir: &Path,
    options: &Options,
) -> Result<Option<Plan>, String> {
    let Some(workspace_ids) = load_workspace_ids(root) else {
        return Ok(None);
    };
    prepare_with_workspace_ids(scope_dir, &workspace_ids, options).map(Some)
}

pub(super) fn prepare_with_workspace_ids(
    scope_dir: &Path,
    workspace_ids: &[CompIdSpec],
    options: &Options,
) -> Result<Plan, String> {
    let keep_versions = options.keep_versions
        .as_deref()
        .and_then(parse_keep_versions)
        .unwrap_or(0);
    let keep_limit = usize::try_from(keep_versions).unwrap_or(usize::MAX);
    let mut inv = load_scope_inventory(scope_dir)?;
    super::graph::models::normalize(&mut inv)?;
    let settled_before = inv.started_at_ms.saturating_sub(RECENT_WRITE_MARGIN_MS);
    let mut graph = GcGraph::new(&inv);
    populate_roots(&mut graph, &inv, workspace_ids, settled_before, keep_limit);
    let kept = graph.expand_referenced(scope_dir);
    Ok(plan_result(scope_dir, &inv, &graph, &kept, (options, settled_before)))
}

fn load_workspace_ids(root: &Path) -> Option<Vec<CompIdSpec>> {
    let ws_bytes = fs::read(root.join("workspace.jsonc")).ok()?;
    let ws_val = bit_object_import::parse_jsonc(&ws_bytes).ok()?;
    if crate::commands::build_cmd::is_bitmap_auto_sync(&ws_val) {
        return None;
    }
    let default_scope = workspace_default_scope(&ws_val).ok()?;
    if !root.join(".bitmap").exists() {
        return Some(Vec::new());
    }
    let bitmap = Bitmap::load(root, Some(&default_scope)).ok()?;
    let specs = bitmap.entries
        .into_iter()
        .map(|entry| CompIdSpec {
            scope: entry.id.scope,
            name: entry.id.name,
            version: entry.id.version,
        })
        .collect();
    Some(specs)
}

fn populate_roots(
    graph: &mut GcGraph,
    inv: &ScopeInventory,
    workspace_ids: &[CompIdSpec],
    settled_before: u64,
    keep_limit: usize,
) {
    let (mut all_heads, detached_heads) = seed_component_roots(graph, &inv.objects);
    let (checked_out_heads, ws_keys) = seed_workspace_roots(graph, workspace_ids);
    let (lane_heads, unattached) = seed_lane_roots(graph, inv);
    seed_lane_history_roots(graph, &inv.objects);
    for remote_ref in &inv.roots.remote_refs {
        graph.add_root(remote_ref);
    }
    let mut bare = inv.roots.bare_roots.clone();
    bare.extend(unattached);
    graph.keep_ancestry_of(&bare, true);
    graph.keep_ancestry_of(&inv.roots.unmerged_roots, false);
    all_heads.extend(lane_heads.iter().cloned());
    all_heads.extend(detached_heads);
    graph.keep_history_of(&all_heads, true, usize::MAX);
    keep_recent_and_limited(
        graph,
        &inv.objects,
        (checked_out_heads, lane_heads, ws_keys),
        (settled_before, keep_limit),
    );
}

fn keep_recent_and_limited(
    graph: &mut GcGraph,
    objects: &[ObjectEntry],
    ws_state: (CompHeadList, CompHeadList, HashSet<String>),
    limits: (u64, usize),
) {
    let (mut keep_starts, lane_heads, ws_keys) = ws_state;
    let (settled_before, keep_limit) = limits;
    for obj in objects {
        if obj.kind == "Version" && obj.mtime_ms > settled_before {
            graph.add_root(&obj.hash);
        }
    }
    if keep_limit > 0 {
        for (comp_key, head) in lane_heads {
            if ws_keys.contains(&comp_key) {
                keep_starts.push((comp_key, head));
            }
        }
        graph.keep_history_of(&keep_starts, false, keep_limit);
    }
}

fn seed_component_roots(
    graph: &mut GcGraph,
    objects: &[ObjectEntry],
) -> (CompHeadList, CompHeadList) {
    let mut comp_heads = Vec::new();
    let mut detached_heads = Vec::new();
    for obj in objects {
        if obj.kind == "Component" {
            seed_one_component(graph, &obj.value, &mut comp_heads, &mut detached_heads);
        }
    }
    (comp_heads, detached_heads)
}

fn seed_one_component(
    graph: &mut GcGraph,
    comp_val: &Value,
    comp_heads: &mut CompHeadList,
    detached_heads: &mut CompHeadList,
) {
    let key = comp_value_key(comp_val);
    if let Some(head) = comp_val["head"].as_str() {
        graph.add_root(head);
        comp_heads.push((key.clone(), head.to_owned()));
    }
    if let Some(heads) = comp_val["detachedHeads"]["heads"].as_array() {
        for head in heads.iter().filter_map(Value::as_str) {
            graph.add_root(head);
            detached_heads.push((key.clone(), head.to_owned()));
        }
    }
    if let Some(orphans) = comp_val["orphanedVersions"].as_object() {
        for hash in orphans.values().filter_map(Value::as_str) {
            graph.add_root(hash);
        }
    }
}

fn seed_workspace_roots(
    graph: &mut GcGraph,
    workspace_ids: &[CompIdSpec],
) -> (CompHeadList, HashSet<String>) {
    let mut checked_out_heads = Vec::new();
    let mut ws_keys = HashSet::new();
    for spec in workspace_ids {
        if let Some(ver) = spec.version.as_deref() {
            graph.add_root(ver);
        }
        let Some(comp) = graph.find_comp(spec.scope.as_deref(), &spec.name).cloned() else {
            continue;
        };
        let key = comp_value_key(&comp);
        ws_keys.insert(key.clone());
        let checked_out = spec.version
            .as_deref()
            .and_then(|ver| resolve_comp_version_ref(&comp, ver))
            .or_else(|| comp["head"].as_str().map(str::to_owned));
        if let Some(head) = checked_out {
            graph.add_root(&head);
            checked_out_heads.push((key, head));
        }
    }
    (checked_out_heads, ws_keys)
}

fn seed_lane_roots(graph: &mut GcGraph, inv: &ScopeInventory) -> (CompHeadList, Vec<String>) {
    let mut lane_heads = Vec::new();
    let mut unattached = Vec::new();
    let live_lanes = inv.objects
        .iter()
        .filter(|obj| obj.kind == "Lane")
        .map(|obj| &obj.value);
    for lane_val in live_lanes.chain(inv.trashed_lanes.iter()) {
        for (comp_key, ver_hash) in lane_component_refs(lane_val) {
            graph.add_root(&ver_hash);
            if graph.models.contains_key(&comp_key) {
                lane_heads.push((comp_key, ver_hash));
            } else {
                unattached.push(ver_hash);
            }
        }
        if let Some(readme_head) = lane_val["readmeComponent"]["head"].as_str() {
            graph.add_root(readme_head);
        }
    }
    (lane_heads, unattached)
}

fn seed_lane_history_roots(graph: &mut GcGraph, objects: &[ObjectEntry]) {
    for obj in objects {
        if obj.kind != "LaneHistory" {
            continue;
        }
        let Some(history) = obj.value["history"].as_object() else { continue };
        for entry in history.values() {
            seed_history_entry(graph, entry);
        }
    }
}

fn seed_history_entry(graph: &mut GcGraph, entry: &Value) {
    for field in ["components", "deleted", "updateDependents"] {
        let Some(arr) = entry[field].as_array() else { continue };
        for item_str in arr.iter().filter_map(Value::as_str) {
            if let Some((_, ver)) = item_str
                .rsplit_once('@')
                .map(|(prefix, ver)| (prefix, ver.trim()))
                .filter(|(_, ver)| !ver.is_empty())
            {
                graph.add_root(ver);
            }
        }
    }
}

fn plan_result(
    scope_dir: &Path,
    inv: &ScopeInventory,
    graph: &GcGraph,
    kept: &HashSet<String>,
    ctx: (&Options, u64),
) -> Plan {
    let (options, settled_before) = ctx;
    let (ver_to_delete, src_to_delete, deleted) =
        collect_deletable_objects(&inv.objects, kept, settled_before);
    let backup_dir = (options.backup && !options.dry_run && deleted.objects > 0).then(|| {
        scope_dir
            .join("deleted-objects")
            .to_string_lossy()
            .into_owned()
    });
    let total_objects_size: u64 = inv.objects
        .iter()
        .map(|obj| obj.size)
        .sum();
    let result = GcResult {
        flags: GcRunFlags { dry_run: options.dry_run, backup: options.backup, backup_dir },
        total_objects: inv.objects.len(),
        total_size: total_objects_size
            + inv.stray_files.size
            + inv.backup_dir_size
            + inv.retained_dirs_size,
        deleted,
        kept_versions: graph.root_versions.len(),
        dirs: GcDirSizes {
            stray_files: inv.stray_files.count,
            stray_files_size: inv.stray_files.size,
            backup_dir_size: inv.backup_dir_size,
            retained_dirs_size: inv.retained_dirs_size,
        },
    };
    Plan {
        result,
        versions: ver_to_delete,
        sources: src_to_delete,
        stray: inv.stray_files.paths.clone(),
    }
}

fn collect_deletable_objects(
    objects: &[ObjectEntry],
    kept: &HashSet<String>,
    settled_before: u64,
) -> (Vec<String>, Vec<String>, GcDeletionStats) {
    let mut ver_to_delete = Vec::new();
    let mut src_to_delete = Vec::new();
    let mut deleted_by_type: BTreeMap<String, DeletedTypeStats> = BTreeMap::new();
    let mut deleted_size = 0u64;
    for obj in objects {
        if (obj.kind != "Version" && obj.kind != "Source")
            || kept.contains(&obj.hash)
            || obj.mtime_ms > settled_before
        {
            continue;
        }
        if obj.kind == "Version" {
            ver_to_delete.push(obj.hash.clone());
        } else {
            src_to_delete.push(obj.hash.clone());
        }
        deleted_size += obj.size;
        let entry = deleted_by_type.entry(obj.kind.clone()).or_default();
        entry.count += 1;
        entry.size += obj.size;
    }
    let deleted_objects = ver_to_delete.len() + src_to_delete.len();
    (
        ver_to_delete,
        src_to_delete,
        GcDeletionStats { objects: deleted_objects, size: deleted_size, by_type: deleted_by_type },
    )
}

fn lane_component_refs(lane_val: &Value) -> CompHeadList {
    let mut out = collect_lane_comp_heads(&lane_val["components"]);
    out.extend(collect_lane_update_deps(&lane_val["updateDependents"]));
    out
}

fn collect_lane_comp_heads(comps_val: &Value) -> CompHeadList {
    let Some(comps) = comps_val.as_array() else { return Vec::new() };
    let mut out = Vec::new();
    for item in comps {
        let Some(head) = item["head"]
            .as_str()
            .filter(|val| !val.is_empty())
        else {
            continue;
        };
        let key = comp_value_key(&item["id"]);
        out.push((key, head.to_owned()));
    }
    out
}

fn collect_lane_update_deps(deps_val: &Value) -> CompHeadList {
    let Some(deps) = deps_val.as_array() else { return Vec::new() };
    let mut out = Vec::new();
    for item in deps {
        let Some(spec) = parse_dep_value(item) else { continue };
        let Some(ver) = spec.version else { continue };
        let key = spec.scope
            .as_deref()
            .filter(|val| !val.is_empty())
            .map_or_else(|| spec.name.clone(), |sc| format!("{sc}/{}", spec.name));
        out.push((key, ver));
    }
    out
}

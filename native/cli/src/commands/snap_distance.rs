//! Native `bit snap-distance <component-id> [source-snap] [target-snap]` (`scopes/component/snapping/snap-distance-cmd.ts`).

mod graph;
#[cfg(test)]
mod tests;

use self::graph::{
    build_parents_map, collect_successors, compute_snap_distance,
    load_version_history_with_local_versions,
};
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
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "snap-distance", aliases: &[], run };

#[derive(Debug, PartialEq, Eq)]
struct Options {
    id: String,
    source_snap: Option<String>,
    target_snap: Option<String>,
}

fn is_hex40(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.len() == 40 && trimmed.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let positional = super::scope_set::collect_non_flag_tokens(args)?;
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
    if let Some(outcome) = validate_target(&root, args, &opts)? {
        return Ok(outcome);
    }
    let Some(result) = evaluate_snap_distance(&root, &opts) else {
        return Ok(Outcome::Declined("snap-distance delegated".into()));
    };
    let data = serde_json::to_string_pretty(&result)?;
    emit_text(&root, args, "snap-distance", true, data)
}

fn validate_target(
    root: &ScopeRoot,
    args: &[OsString],
    opts: &Options,
) -> io::Result<Option<Outcome>> {
    let scope_dir = scope_dir_for(root);
    let bare = opts.id.rsplit_once('@').map_or(opts.id.as_str(), |(id, _)| id);
    let missing_target = opts.source_snap.is_some() && opts.target_snap.is_none();
    if is_valid_scoped_id(&opts.id, bare) && missing_target {
        return emit_missing_target_error(root, args).map(Some);
    }
    if resolve_component_entry(&scope_dir, bare).is_none_or(|(sc, _, _)| sc.is_none()) {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) =
                diagnose_component_lookup_error(&scope_dir, &opts.id, bare, Chalk::detect(args))
        {
            return emit_failure(root, args, "snap-distance", true, false, err).map(Some);
        }
        return Ok(Some(Outcome::Declined("snap-distance component lookup delegated".into())));
    }
    if missing_target {
        return emit_missing_target_error(root, args).map(Some);
    }
    Ok(None)
}

fn is_valid_scoped_id(raw_id: &str, bare: &str) -> bool {
    !raw_id.starts_with('@')
        && bare
            .split_once('/')
            .is_some_and(|(scope, name)| {
                !scope.is_empty() && !name.is_empty() && !name.contains('/')
            })
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
        if is_on_non_main_lane(&bitmap) {
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
    let (lane_scope, lane_name) =
        bitmap_lane_scope_and_name(bitmap_val).filter(|(sc, _)| !sc.is_empty())?;
    if let Some(remote_lane_head) =
        read_remote_ref_head(&scope_dir, lane_scope, lane_name, scope, name)?
    {
        return Some(remote_lane_head != local_head);
    }
    let remote_main = read_remote_main_head(&scope_dir, scope, name)?;
    Some(remote_main.as_deref() != Some(local_head.as_str()))
}

pub(in crate::commands) fn bitmap_lane_scope_and_name(bitmap: &Value) -> Option<(&str, &str)> {
    let id = bitmap.get("_bit_lane")?.get("id")?;
    if let Some(raw) = id.as_str() {
        let bare = raw
            .trim()
            .split('@')
            .next()
            .unwrap_or_default()
            .trim();
        let (scope, name) = bare
            .split_once('/')
            .unwrap_or(("", bare));
        return (!name.trim().is_empty()).then_some((scope.trim(), name.trim()));
    }
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())?;
    Some((id["scope"].as_str().map_or("", str::trim), name))
}

pub(in crate::commands) fn is_on_non_main_lane(bitmap: &Value) -> bool {
    bitmap_lane_scope_and_name(bitmap).is_some_and(|(_, name)| name != "main")
}

fn read_remote_ref_head(
    scope_dir: &Path,
    ref_scope: &str,
    ref_name: &str,
    comp_scope: &str,
    comp_name: &str,
) -> Option<Option<String>> {
    let Some(bytes) = read_remote_ref_bytes(scope_dir, ref_scope, ref_name)? else {
        return Some(None);
    };
    let entries: Value = bit_object_import::parse_jsonc(&bytes).ok()?;
    let full = format!("{comp_scope}/{comp_name}");
    for item in entries.as_array()? {
        let item_scope = item["id"]["scope"].as_str().unwrap_or_default();
        if (item["id"]["name"].as_str() == Some(comp_name)
            && (item_scope.is_empty() || item_scope == comp_scope))
            || item["id"].as_str() == Some(full.as_str())
            || item["id"].as_str() == Some(comp_name)
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

fn read_remote_ref_bytes(
    scope_dir: &Path,
    ref_scope: &str,
    ref_name: &str,
) -> Option<Option<Vec<u8>>> {
    let primary = scope_dir
        .join("refs")
        .join("remote")
        .join(ref_scope)
        .join(ref_name);
    let fallback = scope_dir
        .join("refs")
        .join("remotes")
        .join(ref_scope)
        .join(ref_name);
    match fs::read(primary) {
        Ok(bytes) => Some(Some(bytes)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => match fs::read(fallback) {
            Ok(bytes) => Some(Some(bytes)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Some(None),
            Err(_) => None,
        },
        Err(_) => None,
    }
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
    bitmap
        .as_object()?
        .iter()
        .find_map(|(key, row)| bitmap_row_version(key, row, scope, name, &full))
}

fn bitmap_row_version(
    key: &str,
    row: &Value,
    scope: &str,
    name: &str,
    full: &str,
) -> Option<String> {
    if key.starts_with('$') || matches!(key, "_bit_lane" | "version") || !row.is_object() {
        return None;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(id, _)| id);
    let row_name = super::update_cmd::bitmap_row_name(key, row);
    let row_scope = row["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|val| !val.is_empty())
        })
        .unwrap_or_default();
    let matches = (row_name == name && (row_scope.is_empty() || row_scope == scope))
        || key_id == full
        || key_id.strip_prefix(&format!("{scope}/")) == Some(name);
    if !matches {
        return None;
    }
    row["version"]
        .as_str()
        .filter(|ver| !ver.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            key.rsplit_once('@')
                .filter(|(_, ver)| !ver.is_empty())
                .map(|(_, ver)| ver.to_owned())
        })
}

fn read_remote_main_head(scope_dir: &Path, scope: &str, name: &str) -> Option<Option<String>> {
    read_remote_ref_head(scope_dir, scope, "main", scope, name)
}

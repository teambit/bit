//! Validate the active lane and its component head before local file operations.

use super::{RowKind, invalid, valid_name, valid_scope};
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(crate) struct Lane {
    pub(super) scope: String,
    pub(super) name: String,
    pub(crate) hash: String,
    pub(super) path: PathBuf,
    pub(crate) before: Vec<u8>,
    pub(crate) index_before: Vec<u8>,
    pub(super) value: Value,
}

pub(crate) fn lane_id_parts(id: &Value) -> (&str, &str) {
    if let Some(raw) = id.as_str() {
        let trimmed = raw.trim();
        let bare = trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim());
        return bare
            .split_once('/')
            .map_or(("", bare), |(scope, name)| (scope.trim(), name.trim()));
    }
    let scope = id["scope"].as_str().map_or("", str::trim);
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .map(|nm| nm.rsplit_once('@').map_or(nm, |(base, _)| base.trim()))
        .unwrap_or_default();
    (scope, name)
}

pub(super) fn select_lane(
    root: &Path,
    bitmap: &Value,
    scope: &str,
    component_name: &str,
    expected_version: Option<&str>,
    kind: RowKind,
) -> io::Result<Lane> {
    let (lane_scope, lane_name) = lane_id_parts(&bitmap["_bit_lane"]["id"]);
    if lane_scope.is_empty() {
        return Err(invalid("current lane scope"));
    }
    if lane_name.is_empty() {
        return Err(invalid("current lane name"));
    }
    if (kind == RowKind::ExportedLane && bitmap["_bit_lane"]["exported"] != true)
        || !valid_scope(lane_scope)
        || !valid_name(lane_name)
        || lane_name.contains('/')
    {
        return Err(invalid("unsupported current lane"));
    }
    let lane = read_lane(root, lane_scope, lane_name)?;
    validate_component(&lane.value, scope, component_name, expected_version, kind)?;
    Ok(lane)
}

fn read_lane(root: &Path, scope: &str, name: &str) -> io::Result<Lane> {
    let index_before = fs::read(crate::scope_path(root).join("index.json"))?;
    let index: Value = crate::parse_jsonc(&index_before)?;
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("lane index"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|entry| lane_id_parts(&entry["id"]) == (scope, name))
        .collect();
    if matches.len() != 1 {
        return Err(invalid("current lane is not uniquely indexed"));
    }
    let raw_hash = matches[0]["hash"]
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("lane hash"))?;
    let hash = crate::validate::hexadecimal(&crate::merge_history::hash(raw_hash)?);
    let path = crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let before = fs::read(&path)?;
    let value = outbound::read_object(&crate::scope_path(root).join("objects"), &hash, "Lane")?;
    if value["scope"].as_str().map(str::trim) != Some(scope)
        || value["name"].as_str().map(str::trim) != Some(name)
    {
        return Err(invalid("current lane object identity"));
    }
    Ok(Lane { scope: scope.into(), name: name.into(), hash, path, before, index_before, value })
}

pub(crate) fn matches_component_entry(entry: &Value, scope: &str, name: &str) -> bool {
    let (entry_scope, entry_name) = lane_id_parts(&entry["id"]);
    entry_name == name && (entry_scope == scope || entry_scope.is_empty())
}

fn validate_component(
    lane: &Value,
    scope: &str,
    name: &str,
    expected_version: Option<&str>,
    kind: RowKind,
) -> io::Result<()> {
    let components = lane["components"].as_array().ok_or_else(|| invalid("lane components"))?;
    let matching: Vec<_> = components
        .iter()
        .filter(|entry| matches_component_entry(entry, scope, name))
        .collect();
    if kind == RowKind::New && !matching.is_empty() {
        return Err(invalid("new component is already on lane"));
    }
    let head = matching
        .first()
        .and_then(|entry| entry["head"].as_str())
        .map(str::trim);
    let expected = expected_version.map(str::trim);
    if matches!(kind, RowKind::LaneSnap | RowKind::ExportedLane)
        && (matching.len() != 1
            || head
                .zip(expected)
                .is_none_or(|(left, right)| !left.eq_ignore_ascii_case(right)))
    {
        return Err(invalid("lane head differs from workspace version"));
    }
    Ok(())
}

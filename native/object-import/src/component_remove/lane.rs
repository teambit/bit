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

pub(super) fn select_lane(
    root: &Path,
    bitmap: &Value,
    scope: &str,
    component_name: &str,
    expected_version: Option<&str>,
    kind: RowKind,
) -> io::Result<Lane> {
    let id = &bitmap["_bit_lane"]["id"];
    let lane_scope = id["scope"].as_str().ok_or_else(|| invalid("current lane scope"))?;
    let lane_name = id["name"].as_str().ok_or_else(|| invalid("current lane name"))?;
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
    let index: Value = serde_json::from_slice(&index_before)?;
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("lane index"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|entry| {
            entry["id"]
                .as_str()
                .is_some_and(|raw| raw == format!("{scope}/{name}"))
                || (entry["id"]["scope"] == scope && entry["id"]["name"] == name)
        })
        .collect();
    if matches.len() != 1 {
        return Err(invalid("current lane is not uniquely indexed"));
    }
    let hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("lane hash"))?;
    crate::merge_history::hash(hash)?;
    let path = crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let before = fs::read(&path)?;
    let value = outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Lane")?;
    if value["scope"] != scope || value["name"] != name {
        return Err(invalid("current lane object identity"));
    }
    Ok(Lane {
        scope: scope.into(),
        name: name.into(),
        hash: hash.into(),
        path,
        before,
        index_before,
        value,
    })
}

pub(super) fn matches_component_entry(entry: &Value, scope: &str, name: &str) -> bool {
    if let Some(raw) = entry["id"].as_str() {
        let base = raw.split('@').next().unwrap_or(raw);
        return base == name || base == format!("{scope}/{name}");
    }
    let entry_scope = entry["id"]["scope"].as_str().unwrap_or_default();
    (entry_scope == scope || entry_scope.is_empty()) && entry["id"]["name"] == name
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
    if matches!(kind, RowKind::LaneSnap | RowKind::ExportedLane)
        && (matching.len() != 1 || matching[0]["head"].as_str() != expected_version)
    {
        return Err(invalid("lane head differs from workspace version"));
    }
    Ok(())
}

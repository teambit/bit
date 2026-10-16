//! Validate the active unexported lane before local component removal.

use super::{RowKind, invalid, valid_name, valid_scope};
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Lane {
    pub(super) scope: String,
    pub(super) name: String,
    pub(super) hash: String,
    pub(super) path: PathBuf,
    pub(super) before: Vec<u8>,
    pub(super) value: Value,
}

pub(super) fn select_lane(
    root: &Path,
    bitmap: &Value,
    scope: &str,
    component_name: &str,
    component: &Value,
    kind: RowKind,
) -> io::Result<Lane> {
    let id = &bitmap["_bit_lane"]["id"];
    let lane_scope = id["scope"].as_str().ok_or_else(|| invalid("current lane scope"))?;
    let lane_name = id["name"].as_str().ok_or_else(|| invalid("current lane name"))?;
    if bitmap["_bit_lane"]["exported"] != false
        || !valid_scope(lane_scope)
        || !valid_name(lane_name)
        || lane_name.contains('/')
    {
        return Err(invalid("unsupported current lane"));
    }
    let lane = read_lane(root, id, lane_scope, lane_name)?;
    validate_component(&lane.value, scope, component_name, component, kind)?;
    Ok(lane)
}

fn read_lane(root: &Path, id: &Value, scope: &str, name: &str) -> io::Result<Lane> {
    let index: Value = serde_json::from_slice(&fs::read(root.join(".bit/index.json"))?)?;
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("lane index"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|entry| entry["id"] == *id)
        .collect();
    if matches.len() != 1 {
        return Err(invalid("current lane is not uniquely indexed"));
    }
    let hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("lane hash"))?;
    crate::merge_history::hash(hash)?;
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let before = fs::read(&path)?;
    let value = outbound::read_object(&root.join(".bit/objects"), hash, "Lane")?;
    if value["scope"] != scope || value["name"] != name {
        return Err(invalid("current lane object identity"));
    }
    Ok(Lane { scope: scope.into(), name: name.into(), hash: hash.into(), path, before, value })
}

fn validate_component(
    lane: &Value,
    scope: &str,
    name: &str,
    component: &Value,
    kind: RowKind,
) -> io::Result<()> {
    let components = lane["components"].as_array().ok_or_else(|| invalid("lane components"))?;
    let matching: Vec<_> = components
        .iter()
        .filter(|entry| entry["id"]["scope"] == scope && entry["id"]["name"] == name)
        .collect();
    if kind == RowKind::New && !matching.is_empty() {
        return Err(invalid("new component is already on lane"));
    }
    if kind == RowKind::LaneSnap
        && (matching.len() != 1 || matching[0]["head"] != component["version"])
    {
        return Err(invalid("lane head differs from workspace version"));
    }
    Ok(())
}

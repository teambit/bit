//! Resolve parent lane or main origin state for `lane create` and `lane merge-move`.

use super::{Documents, invalid, valid_hash};
use crate::workspace::engine::command::outbound;
use flate2::read::ZlibDecoder;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

pub(super) struct Origin {
    pub parent_name: Option<String>,
    pub components: Vec<Value>,
    pub forked_from: Option<Value>,
}

impl Origin {
    pub(super) fn read(
        root: &Path,
        documents: &Documents,
        scope: &str,
        new_scope: bool,
    ) -> io::Result<Self> {
        if let Some(parent) = documents.bitmap.get("_bit_lane")
            && parent["id"]["name"]
                .as_str()
                .is_some_and(|name| !name.is_empty() && name != "main")
        {
            return Self::from_parent(
                root,
                &documents.index,
                &documents.bitmap,
                parent,
                scope,
                new_scope,
            );
        }
        Ok(Self { parent_name: None, components: Vec::new(), forked_from: None })
    }

    fn from_parent(
        root: &Path,
        index: &Value,
        bitmap: &Value,
        parent: &Value,
        scope: &str,
        new_scope: bool,
    ) -> io::Result<Self> {
        let parent_id = &parent["id"];
        let parent_name = parent_id["name"].as_str().ok_or_else(invalid)?;
        let parent_scope = parent_id["scope"].as_str().unwrap_or_default();
        let row = index["lanes"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .find(|row| matches_lane_row(row, parent_id, parent_scope, parent_name))
            .ok_or_else(invalid)?;
        let hash = row["hash"].as_str().ok_or_else(invalid)?;
        let objects_dir = bit_workspace_config::scope_path(root).join("objects");
        let lane = outbound::read_object(&objects_dir, hash, "Lane")?;
        Self::from_lane_object(root, bitmap, parent, &lane, scope, new_scope)
    }

    pub(super) fn from_backup_lane(
        root: &Path,
        bitmap: &Value,
        backup_lane: &Value,
        scope: &str,
    ) -> io::Result<Self> {
        let parent = bitmap.get("_bit_lane").ok_or_else(invalid)?;
        Self::from_lane_object(root, bitmap, parent, backup_lane, scope, false)
    }

    fn from_lane_object(
        root: &Path,
        bitmap: &Value,
        parent: &Value,
        lane: &Value,
        scope: &str,
        new_scope: bool,
    ) -> io::Result<Self> {
        let parent_id = &parent["id"];
        let parent_name = parent_id["name"]
            .as_str()
            .ok_or_else(invalid)?
            .to_owned();
        let parent_scope = parent_id["scope"].as_str().ok_or_else(invalid)?;
        if scope != parent_scope && !new_scope {
            return Err(invalid());
        }
        let objects_dir = bit_workspace_config::scope_path(root).join("objects");
        let components = active_lane_components(&objects_dir, lane, bitmap)?;
        let forked_from = if parent["exported"] == true {
            Some(parent_id.clone())
        } else {
            lane.get("forkedFrom").cloned()
        };
        Ok(Self { parent_name: Some(parent_name), components, forked_from })
    }
}

pub(super) fn read_merge_move_backup(
    root: &Path,
    index: &Value,
    bitmap: &Value,
) -> io::Result<(String, Vec<u8>, Value)> {
    let parent_id = &bitmap.get("_bit_lane").ok_or_else(invalid)?["id"];
    let parent_name = parent_id["name"].as_str().ok_or_else(invalid)?;
    let parent_scope = parent_id["scope"].as_str().unwrap_or_default();
    let row = index["lanes"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .find(|row| matches_lane_row(row, parent_id, parent_scope, parent_name))
        .ok_or_else(invalid)?;
    let expected_hash = row["hash"].as_str().ok_or_else(invalid)?;
    let backup_bytes = fs::read(bit_workspace_config::scope_path(root).join("last-merged/lane"))?;
    let value = decode_backup_lane(&backup_bytes, expected_hash)?;
    if value["name"] != parent_id["name"] || value["scope"] != parent_id["scope"] {
        return Err(invalid());
    }
    Ok((expected_hash.to_owned(), backup_bytes, value))
}

fn matches_lane_row(row: &Value, parent_id: &Value, scope: &str, name: &str) -> bool {
    row["id"] == *parent_id
        || row["id"].as_str() == Some(&format!("{scope}/{name}"))
        || (row["id"]["name"] == name
            && (row["id"]["scope"]
                .as_str()
                .unwrap_or_default()
                .is_empty()
                || row["id"]["scope"] == scope))
}

fn decode_backup_lane(backup_bytes: &[u8], expected_hash: &str) -> io::Result<Value> {
    let mut raw = Vec::new();
    ZlibDecoder::new(backup_bytes)
        .take(8 * 1024 * 1024 + 1)
        .read_to_end(&mut raw)?;
    if raw.len() > 8 * 1024 * 1024 {
        return Err(invalid());
    }
    let nul = raw
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(invalid)?;
    let header = std::str::from_utf8(&raw[..nul]).map_err(|_| invalid())?;
    let fields = header.split(' ').collect::<Vec<_>>();
    if fields.len() != 3 || fields[0] != "Lane" || fields[1] != expected_hash {
        return Err(invalid());
    }
    serde_json::from_slice(&raw[nul + 1..]).map_err(|_| invalid())
}

fn active_lane_components(
    objects_dir: &Path,
    lane: &Value,
    bitmap: &Value,
) -> io::Result<Vec<Value>> {
    let mut components = Vec::new();
    for entry in lane["components"].as_array().ok_or_else(invalid)? {
        let head = entry["head"].as_str().ok_or_else(invalid)?;
        let version = outbound::read_object(objects_dir, head, "Version")?;
        let removed = version["extensions"]
            .as_array()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|row| {
                        crate::workspace::engine::client_status::config::is_extension_aspect(
                            row,
                            "teambit.component/remove",
                        ) && (row["config"]["removed"] == true || row["data"]["removed"] == true)
                    })
            });
        if !removed {
            let mut next = entry.clone();
            if let Some(bitmap_head) = bitmap_snap_head(bitmap, &entry["id"]) {
                next["head"] = json!(bitmap_head);
            }
            components.push(next);
        }
    }
    Ok(components)
}

fn bitmap_snap_head<'a>(bitmap: &'a Value, id: &Value) -> Option<&'a str> {
    let scope = id["scope"].as_str()?;
    let name = id["name"].as_str()?;
    let full = format!("{scope}/{name}");
    bitmap
        .as_object()?
        .iter()
        .find_map(|(key, row)| {
            if !snap_row_matches(key, row, scope, name, &full) {
                return None;
            }
            row["version"]
                .as_str()
                .filter(|ver| !ver.is_empty())
                .or_else(|| key.rsplit_once('@').map(|(_, ver)| ver))
                .filter(|ver| valid_hash(ver))
        })
}

fn snap_row_matches(key: &str, row: &Value, scope: &str, name: &str, _full: &str) -> bool {
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !row.is_object()
        || row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
    {
        return false;
    }
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    row_name == name && row_scope.is_none_or(|sc| sc == scope)
}

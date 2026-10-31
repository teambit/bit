//! The `.bitmap` entries `bit list` reads: `getAllBitIds()`,
//! `getComponentDir()`, the current lane and whether a component is on it.

use super::decline;
use serde_json::Value;
use std::{fs, io, path::Path};

/// A component of the bitmap.
#[derive(Debug, PartialEq, Eq)]
pub(in crate::commands) struct Entry {
    /// `scope/name`, with the default scope for a component not exported.
    pub identity: String,
    /// Whether the id has its own scope (`hasScope()`).
    pub has_scope: bool,
    pub version: Option<String>,
    pub root_dir: String,
    pub staged_deprecation: bool,
    pub deprecation: Option<Value>,
    removed: bool,
    available: bool,
}

impl Entry {
    /// `isIdOnCurrentLane`: not removed, and available on the lane or one of
    /// its components. On main, `lane` is empty.
    pub fn on_current_lane(&self, lane: &[String]) -> bool {
        !self.removed && self.on_current_lane_including_removed(lane)
    }

    /// `idsByPattern` with `includeDeleted`: availability still follows the lane.
    pub fn on_current_lane_including_removed(&self, lane: &[String]) -> bool {
        self.available || lane.contains(&self.identity)
    }
}

/// The bitmap: its entries, in order, and the current lane's id
/// (`_bit_lane.id`), absent on main.
pub(in crate::commands) struct Bitmap {
    pub entries: Vec<Entry>,
    pub lane: Option<Value>,
}

pub(in crate::commands) fn read(root: &Path) -> io::Result<Bitmap> {
    let text = fs::read_to_string(root.join(".bitmap"))?;
    let document = bit_install::jsonc::parse(&text).map_err(|_| decline("bitmap syntax"))?;
    let document = document.as_object().ok_or_else(|| decline("bitmap"))?;
    let lane = match document.get("_bit_lane") {
        None => None,
        Some(lane) => Some(lane_id(lane)?),
    };
    let entries = document
        .iter()
        .filter(|(key, value)| {
            !key.starts_with('$')
                && key.as_str() != "version"
                && key.as_str() != "_bit_lane"
                && value.is_object()
        })
        .map(|(_, value)| entry(value))
        .collect::<io::Result<_>>()?;
    Ok(Bitmap { entries, lane })
}

/// `{ scope, name }` of `_bit_lane.id`.
fn lane_id(lane: &Value) -> io::Result<Value> {
    let id = &lane["id"];
    let valid = |field: &str| {
        id[field]
            .as_str()
            .is_some_and(|text| !text.is_empty())
    };
    if !valid("scope") || !valid("name") {
        return Err(decline("bitmap lane id"));
    }
    Ok(serde_json::json!({ "scope": id["scope"], "name": id["name"] }))
}

fn entry(value: &Value) -> io::Result<Entry> {
    let text = |field: &str| {
        value[field]
            .as_str()
            .filter(|text| !text.is_empty())
    };
    let name = text("name").ok_or_else(|| decline("bitmap entry name"))?;
    let (scope, has_scope) = match text("scope") {
        Some(scope) => (scope, true),
        None => (text("defaultScope").ok_or_else(|| decline("bitmap default scope"))?, false),
    };
    let root_dir = text("rootDir").ok_or_else(|| decline("bitmap root dir"))?;
    let dep_entry = crate::commands::update_cmd::aspect_entry(
        &value["config"],
        "teambit.component/deprecation",
    )
    .map(|(_, dep)| dep);
    if !matches!(value["version"], Value::String(_) | Value::Null) {
        return Err(decline("bitmap entry version"));
    }
    Ok(Entry {
        identity: format!("{scope}/{name}"),
        has_scope,
        version: text("version").map(str::to_string),
        root_dir: root_dir.to_string(),
        staged_deprecation: dep_entry.is_some_and(Value::is_object),
        deprecation: dep_entry
            .and_then(Value::as_object)
            .map(|config| Value::Object(config.clone())),
        removed: crate::commands::update_cmd::aspect_entry(
            &value["config"],
            "teambit.component/remove",
        )
        .is_some_and(|(_, rem)| rem["removed"] == true),
        available: value["isAvailableOnCurrentLane"] != false,
    })
}

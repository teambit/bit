//! The `.bitmap` entries `bit list` reads: `getAllBitIds()`,
//! `getComponentDir()` and whether a component is on main.

use super::decline;
use serde_json::Value;
use std::{fs, io, path::Path};

/// A component of the bitmap.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Entry {
    /// `scope/name`, with the default scope for a component not exported.
    pub identity: String,
    /// Whether the id has its own scope (`hasScope()`).
    pub has_scope: bool,
    pub version: Option<String>,
    pub root_dir: String,
    removed: bool,
    available: bool,
}

impl Entry {
    /// `isIdOnCurrentLane` when the workspace is on main.
    pub fn on_main(&self) -> bool {
        !self.removed && self.available
    }
}

/// The entries in the bitmap's order. A workspace on a lane declines.
pub(super) fn read(root: &Path) -> io::Result<Vec<Entry>> {
    let text = fs::read_to_string(root.join(".bitmap"))?;
    let document = bit_install::jsonc::parse(&text).map_err(|_| decline("bitmap syntax"))?;
    let document = document.as_object().ok_or_else(|| decline("bitmap"))?;
    if document.contains_key("_bit_lane") {
        return Err(decline("the workspace is on a lane"));
    }
    document
        .iter()
        .filter(|(key, value)| !key.starts_with('$') && value.is_object())
        .map(|(_, value)| entry(value))
        .collect()
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
    let removed = value["config"]["teambit.component/remove"]["removed"] == true;
    let available = value["isAvailableOnCurrentLane"] != false;
    if !matches!(value["version"], Value::String(_) | Value::Null) {
        return Err(decline("bitmap entry version"));
    }
    Ok(Entry {
        identity: format!("{scope}/{name}"),
        has_scope,
        version: text("version").map(str::to_string),
        root_dir: root_dir.to_string(),
        removed,
        available,
    })
}

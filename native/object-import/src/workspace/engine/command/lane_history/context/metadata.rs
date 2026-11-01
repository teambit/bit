use super::{invalid, status_context};
use crate::workspace::engine::{
    client_status::config,
    command::{input::Prepare, lane_history::Phase},
};
use serde_json::Value;
use std::{collections::HashMap, io};
pub(super) fn read(
    request: &Prepare,
    pool: &rayon::ThreadPool,
    bitmap: &Value,
    settings: &Value,
    phase: &Phase,
) -> io::Result<Value> {
    let all = all_targets(bitmap, settings)?;
    let mut by_id = HashMap::with_capacity(all.len());
    for row in &all {
        if let Some(id) = row_bare_identity(row) {
            by_id.entry(id).or_insert(row);
        }
    }
    let targets = phase.versions
        .iter()
        .filter_map(|(id, _)| {
            by_id
                .get(bare_identity(id)?)
                .copied()
                .cloned()
        })
        .collect();
    let input = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    status_context::metadata_with_targets(&input, pool, settings, targets)
}

#[inline]
fn bare_identity(raw: &str) -> Option<&str> {
    let raw = raw.trim();
    let base = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
    (!base.is_empty()).then_some(base)
}

#[inline]
fn row_bare_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .and_then(bare_identity)
        .or_else(|| row["id"].as_str().and_then(bare_identity))
}
fn all_targets(bitmap: &Value, settings: &Value) -> io::Result<Vec<Value>> {
    let mut bitmap = bitmap
        .as_object()
        .ok_or_else(|| invalid("history bitmap"))?
        .clone();
    bitmap.remove("_bit_lane");
    for (key, row) in &mut bitmap {
        if is_metadata_bitmap_key(key) {
            continue;
        }
        let Some(row) = row.as_object_mut() else {
            continue;
        };
        row.remove("isAvailableOnCurrentLane");
        row.remove("onLanesOnly");
    }
    config::context_bitmap_targets(&Value::Object(bitmap), settings)
}

#[inline]
fn is_metadata_bitmap_key(key: &str) -> bool {
    key.starts_with('$') || key == "version"
}

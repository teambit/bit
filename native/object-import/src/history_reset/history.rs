//! `LaneHistory` entry pruning ([`prune`], [`history_entries`], [`Request`]) and `UTF-16` key validation during `bit reset`.

use super::{bound, invalid, text};
use crate::js_json;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
/// Deserialized `historyResetLaneHistory` request payload (`fields` and pruned `keys`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    fields: js_json::Value,
    keys: Vec<String>,
}
/// Projects and validates the `UTF-16` `history` map entries from a `LaneHistory` object.
fn history_entries(fields: &js_json::Value) -> io::Result<Vec<(Vec<u16>, js_json::Value)>> {
    let projected = crate::snapshot_projection::project("LaneHistory", fields)?;
    let js_json::Value::Object(fields) = projected else {
        return Err(invalid("lane history fields"));
    };
    let history = fields
        .into_iter()
        .find(|(key, _)| {
            key.iter()
                .copied()
                .eq("history".encode_utf16())
        })
        .map(|(_, value)| value)
        .ok_or_else(|| invalid("lane history missing"))?;
    let js_json::Value::Object(entries) = history else {
        return Err(invalid("lane history map"));
    };
    bound(entries.len())?;
    if entries.iter().any(|(key, _)| invalid_key(key)) {
        return Err(invalid("lane history key"));
    }
    Ok(entries)
}
/// Returns `true` when `UTF-16` `key` is empty, exceeds `32768` code units, or is blank/control.
#[inline]
fn invalid_key(key: &[u16]) -> bool {
    if key.is_empty() || key.len() > 32768 {
        return true;
    }
    let mut all_whitespace = true;
    for &unit in key {
        if unit <= 0x1f || unit == 0x7f {
            return true;
        }
        if unit > 0x20 {
            all_whitespace = false;
        }
    }
    all_whitespace
}
/// Computes the removed and retained entry indices when pruning `keys` from a `LaneHistory` [`Request`] object.
pub(super) fn prune(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.keys.len())?;
    let entries = history_entries(&request.fields)?;
    let mut removed = HashSet::with_capacity(request.keys.len());
    let mut remove = Vec::with_capacity(request.keys.len());
    for key in &request.keys {
        text(key)?;
        let key = key.trim();
        if let Some(index) = entries
            .iter()
            .position(|(entry, _)| {
                entry
                    .iter()
                    .copied()
                    .eq(key.encode_utf16())
            })
            && removed.insert(index)
        {
            remove.push(index);
        }
    }
    let retained: Vec<_> = (0..entries.len())
        .filter(|index| !removed.contains(index))
        .collect();
    Ok(json!({"remove":remove,"retained":retained}))
}

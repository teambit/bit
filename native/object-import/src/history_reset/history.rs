use super::{bound, invalid, text};
use crate::js_json;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    fields: js_json::Value,
    keys: Vec<String>,
}
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
    if entries.iter().any(|(key, _)| key.is_empty()) {
        return Err(invalid("lane history key"));
    }
    Ok(entries)
}
pub(super) fn prune(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.keys.len())?;
    let entries = history_entries(&request.fields)?;
    let mut removed = HashSet::new();
    let mut remove = Vec::new();
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

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
pub(super) fn prune(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    bound(request.keys.len())?;
    let projected = crate::snapshot_projection::project("LaneHistory", &request.fields)?;
    let js_json::Value::Object(fields) = projected else {
        return Err(invalid("lane history fields"));
    };
    let history = fields
        .iter()
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
    let mut removed = HashSet::new();
    let mut remove = Vec::new();
    for key in &request.keys {
        text(key)?;
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

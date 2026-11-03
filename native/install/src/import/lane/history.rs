//! `LaneHistory` (`scopes/scope/objects/models/lane-history.ts`): one entry per
//! saved lane state, keyed by a UUID and merged into the existing object.
//!
//! Compute `LaneHistory` SHA-1 object hashes ([`history_hash`]) and record import log entries with [`Identity`].

use super::object::LaneObject;
use crate::{
    import::objects::{Repo, compress_json, sha1_hex},
    model::GlobalConfig,
};
use serde_json::{Map, Value, json};
use std::{
    io,
    time::{SystemTime, UNIX_EPOCH},
};

/// Compute the `BitObject.hash()` SHA-1 digest (`sha1("<laneHash>:LaneHistory")`) for a `LaneHistory` object.
#[must_use]
#[inline]
pub fn history_hash(lane_hash: &str) -> String {
    sha1_hex(&format!("{}:LaneHistory", lane_hash.trim()))
}

/// `getBasicLog()` identity: `user.name` and `user.email` from the bit config.
/// The cloud username lookup needs the network; the config name is its fallback.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Identity {
    /// Configured `user.name` from Bit's global config.
    pub username: Option<String>,
    /// Configured `user.email` from Bit's global config.
    pub email: Option<String>,
}

impl Identity {
    /// Extract `user.name` and `user.email` from [`GlobalConfig`] `global` for `LaneHistory` log entries.
    #[must_use]
    #[inline]
    pub fn from_config(global: &GlobalConfig) -> Self {
        let text = |dotted: &str, underscored: &str, nested: &str| {
            global
                .get(dotted)
                .or_else(|| global.get(underscored))
                .or_else(|| {
                    global
                        .get("user")
                        .and_then(|user| user.get(nested))
                })
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        Self {
            username: text("user.name", "user_name", "name"),
            email: text("user.email", "user_email", "email"),
        }
    }
}

/// `Lanes.updateLaneHistory` + `writeObjectsToTheFS`: add one entry for [`LaneObject`] `lane`
/// to its history object in [`Repo`] (created when missing) and write it.
pub fn record(
    repo: &Repo,
    lane: &LaneObject,
    message: &str,
    identity: &Identity,
) -> io::Result<()> {
    let hash = history_hash(&lane.hash);
    let mut history = match repo.read_json(&hash)?.filter(Value::is_object) {
        Some(existing) => existing,
        None => {
            json!({ "name": lane.name, "scope": lane.scope, "laneHash": lane.hash, "history": {} })
        }
    };
    if !history["history"].is_object() {
        history["history"] = json!({});
    }
    history["history"][new_history_key()] = entry(lane, message, identity);
    repo.write_raw(&hash, &compress_json("LaneHistory", &hash, &history)?)
}

/// `LaneHistory.addHistory`'s item: `log`, visible `components`, `deleted`
/// when any, and always `updateDependents`.
fn entry(lane: &LaneObject, message: &str, identity: &Identity) -> Value {
    let mut log = Map::new();
    for (key, field) in [("username", &identity.username), ("email", &identity.email)] {
        if let Some(value) = field
            .as_deref()
            .map(str::trim)
            .filter(|val| !val.is_empty())
        {
            log.insert(key.into(), json!(value));
        }
    }
    log.insert("message".into(), json!(message.trim()));
    log.insert("date".into(), json!(now_millis().to_string()));
    let components: Vec<String> = lane
        .component_ids()
        .iter()
        .map(super::super::bitmap::Id::to_request)
        .collect();
    let deleted: Vec<String> = lane.components
        .iter()
        .filter(|component| component.is_deleted)
        .map(|comp| format!("{}/{}@{}", comp.scope.trim(), comp.name.trim(), comp.head.trim()))
        .collect();
    let update_dependents: Vec<String> = lane.update_dependents
        .iter()
        .flatten()
        .map(super::super::bitmap::Id::to_request)
        .collect();
    let mut item = json!({ "log": log, "components": components });
    if !deleted.is_empty() {
        item["deleted"] = json!(deleted);
    }
    item["updateDependents"] = json!(update_dependents);
    item
}

#[inline]
fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

/// `newLaneHistoryKey()`: a random UUID v4.
#[inline]
fn new_history_key() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes)
        .unwrap_or_else(|_| {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |elapsed| elapsed.as_nanos());
            bytes = nanos.to_le_bytes();
        });
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let raw = u128::from_be_bytes(bytes);
    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        (raw >> 96) as u32,
        ((raw >> 80) & 0xffff) as u16,
        ((raw >> 64) & 0xffff) as u16,
        ((raw >> 48) & 0xffff) as u16,
        raw & 0xffff_ffff_ffff,
    )
}

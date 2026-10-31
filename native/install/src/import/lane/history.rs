//! `LaneHistory` (`scopes/scope/objects/models/lane-history.ts`): one entry per
//! saved lane state, keyed by a UUID, merged into the existing object.

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

/// `BitObject.hash()` of a `LaneHistory`: `sha1("<laneHash>:LaneHistory")`.
#[must_use]
pub fn history_hash(lane_hash: &str) -> String {
    sha1_hex(&format!("{}:LaneHistory", lane_hash.trim()))
}

/// `getBasicLog()` identity: `user.name` and `user.email` from the bit config.
/// The cloud username lookup needs the network; the config name is its fallback.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Identity {
    pub username: Option<String>,
    pub email: Option<String>,
}

impl Identity {
    #[must_use]
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

/// `Lanes.updateLaneHistory` + `writeObjectsToTheFS`: add one entry for `lane`
/// to its history object (created when missing) and write it.
pub fn record(
    repo: &Repo,
    lane: &LaneObject,
    message: &str,
    identity: &Identity,
) -> io::Result<()> {
    let hash = history_hash(&lane.hash);
    let mut history = match repo.read_json(&hash)? {
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
    if let Some(username) = &identity.username {
        log.insert("username".into(), json!(username));
    }
    if let Some(email) = &identity.email {
        log.insert("email".into(), json!(email));
    }
    log.insert("message".into(), json!(message));
    log.insert("date".into(), json!(now_millis().to_string()));
    let components: Vec<String> = lane
        .component_ids()
        .iter()
        .map(super::super::bitmap::Id::to_request)
        .collect();
    let deleted: Vec<String> = lane.components
        .iter()
        .filter(|component| component.is_deleted)
        .map(|component| format!("{}/{}@{}", component.scope, component.name, component.head))
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

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

/// `newLaneHistoryKey()`: a random UUID v4.
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
    let hex = format!("{:032x}", u128::from_be_bytes(bytes));
    format!("{}-{}-{}-{}-{}", &hex[..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..])
}

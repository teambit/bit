//! Read a local lane's validated history object without a Node object round trip.
pub use diagnostic::ci_requires_published_diagnostic;
mod diagnostic;
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{io, path::Path};

/// Return the history for a lane already resolved in the local index.
pub fn read(root: &Path, lane_hash: &str) -> io::Result<Value> {
    read_at(&crate::scope_path(root), lane_hash)
}

pub(crate) fn read_at(directory: &Path, lane_hash: &str) -> io::Result<Value> {
    let lane_hash = lane_hash.trim();
    if lane_hash.len() != 40
        || !lane_hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid());
    }
    let hash = hash(lane_hash);
    let value = outbound::read_object(&directory.join("objects"), &hash, "LaneHistory")?;
    // A rename or scope change preserves the Lane hash and the history object's
    // original name/scope, so only the stable identity can be checked here.
    if value["laneHash"].as_str().map(str::trim) != Some(lane_hash) {
        return Err(invalid());
    }
    let history = value["history"].as_object().ok_or_else(invalid)?;
    if history.len() > 4096 {
        return Err(invalid());
    }
    for (id, entry) in history {
        if id.trim().is_empty()
            || !entry["log"].is_object()
            || entry["log"]["date"]
                .as_str()
                .and_then(|date| date.trim().parse::<i64>().ok())
                .is_none()
            || !entry["components"].is_array()
        {
            return Err(invalid());
        }
    }
    Ok(value)
}

pub(crate) fn hash(lane_hash: &str) -> String {
    format!("{:x}", Sha1::digest(format!("{lane_hash}:LaneHistory").as_bytes()))
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "unsupported local lane history")
}

//! Read a local lane's validated `LaneHistory` object ([`read`], [`ci_requires_published_diagnostic`]) without a `Node.js` object round trip.
pub use diagnostic::ci_requires_published_diagnostic;
mod diagnostic;
use crate::workspace::engine::command::outbound;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{io, path::Path};

/// Return the history for a lane already resolved in the local index.
#[inline]
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
    if history.len() > 4096
        || history
            .iter()
            .any(|(id, entry)| !valid_history_entry(id, entry))
    {
        return Err(invalid());
    }
    Ok(value)
}

fn is_non_empty_string_array(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .all(|row| {
                    row.as_str()
                        .is_some_and(|text| !text.trim().is_empty())
                })
        })
}

fn valid_history_entry(id: &str, entry: &Value) -> bool {
    let id = id.trim();
    !id.is_empty()
        && id.len() <= 256
        && !id.contains('\0')
        && entry["log"].is_object()
        && entry["log"]["date"]
            .as_str()
            .and_then(|date| date.trim().parse::<i64>().ok())
            .is_some()
        && is_non_empty_string_array(&entry["components"])
        && entry
            .get("updateDependents")
            .is_none_or(|dependents| dependents.is_null() || is_non_empty_string_array(dependents))
}

#[inline]
pub(crate) fn hash(lane_hash: &str) -> String {
    let mut sha1 = Sha1::new();
    sha1.update(lane_hash.trim().as_bytes());
    sha1.update(b":LaneHistory");
    crate::validate::hexadecimal(&sha1.finalize())
}

#[inline]
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "unsupported local lane history")
}

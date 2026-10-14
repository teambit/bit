//! The object stream framing of `ObjectList.fromObjectStreamToTar`: one tar
//! entry per compressed object named `[scope/]hash`, between `.BIT.START` and
//! `.BIT.END` metadata entries. A `.BIT.ERROR` entry carries a server error.

use super::objects::{invalid, is_hash};
use serde_json::Value;
use std::io::{self, Read};

const START: &str = ".BIT.START";
const END: &str = ".BIT.END";
const ERROR: &str = ".BIT.ERROR";
/// `OBJECT_LIST_CURRENT_SCHEMA`.
const SCHEMA: &str = "1.0.0";

/// A compressed object received from (or served by) a remote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectItem {
    pub hash: String,
    pub compressed: Vec<u8>,
    pub scope: Option<String>,
}

/// Parse a complete fetch response.
pub fn read(bytes: &[u8]) -> io::Result<Vec<ObjectItem>> {
    let mut archive = ::tar::Archive::new(bytes);
    let mut items = Vec::new();
    let mut start: Option<Value> = None;
    let mut ended = false;
    for entry in archive.entries()? {
        let mut entry = entry?;
        let name = String::from_utf8_lossy(&entry.path_bytes()).into_owned();
        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;
        match name.as_str() {
            ERROR => return Err(io::Error::other(String::from_utf8_lossy(&data).into_owned())),
            START => start = serde_json::from_slice(&data).ok(),
            END => ended = true,
            _ => items.push(item(&name, data)?),
        }
    }
    if start
        .as_ref()
        .is_some_and(|start| start["schema"] == SCHEMA)
        && !ended
    {
        let metadata = start.unwrap_or_default();
        return Err(io::Error::other(format!(
            "server terminated the stream unexpectedly (metadata: {metadata})",
        )));
    }
    Ok(items)
}

fn item(name: &str, compressed: Vec<u8>) -> io::Result<ObjectItem> {
    let (scope, hash) = match name.split_once('/') {
        Some((scope, hash)) => (Some(scope.to_string()), hash),
        None => (None, name),
    };
    if !is_hash(hash) {
        return Err(invalid(&format!("invalid object ref: {name:?}")));
    }
    Ok(ObjectItem { hash: hash.to_string(), compressed, scope })
}

//! Identity projection from detected dependency lifecycles.

use super::{array, decline, text};
use serde_json::Value;
use std::io;

/// The identities of the peer lifecycle.
pub(super) fn peer_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let lifecycles = array(state.get("components"), "dependency lifecycles")?;
    let peers = array(lifecycles.get(2), "peer dependencies")?;
    peers
        .iter()
        .map(|index| {
            let entry = index
                .as_u64()
                .and_then(|index| entries.get(index as usize));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            text(entry.get("identity")).map(str::to_string)
        })
        .collect()
}

/// Every dependency identity, in lifecycle order.
pub(super) fn dependency_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let mut identities = Vec::new();
    for indices in array(state.get("components"), "dependency lifecycles")? {
        for index in array(Some(indices), "dependency indices")? {
            let entry = index
                .as_u64()
                .and_then(|index| entries.get(index as usize));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            identities.push(text(entry.get("identity"))?.to_string());
        }
    }
    Ok(identities)
}

/// The identity without its `@version`.
pub(super) fn base_identity(identity: &str) -> &str {
    identity
        .rfind('@')
        .map_or(identity, |separator| &identity[..separator])
}

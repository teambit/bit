//! Supported workspace policy shapes for dependency debug output.

use super::ManualPolicy;
use crate::commands::scope_set::Failure;
use serde_json::{Map, Value};
use std::collections::HashSet;

pub(super) fn apply_lifecycle_precedence(manual: &mut ManualPolicy) {
    let peer_names = manual.peer
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<HashSet<_>>();
    manual.dev.retain(|(name, _)| !peer_names.contains(name.as_str()));
    let dev_names = manual.dev
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<HashSet<_>>();
    manual.runtime.retain(|(name, _)| {
        !dev_names.contains(name.as_str()) && !peer_names.contains(name.as_str())
    });
    manual.unresolved_plus.retain(|name| {
        !dev_names.contains(name.as_str()) && !peer_names.contains(name.as_str())
    });
}

pub(super) fn unresolved_plus(field: &str, values: &Value) -> Result<Vec<String>, Failure> {
    let names = values
        .as_object()
        .into_iter()
        .flat_map(|entries| entries.iter())
        .filter(|(_, value)| value.as_str() == Some("+"))
        .map(|(name, _)| name.clone())
        .collect::<Vec<_>>();
    if field != "dependencies" && !names.is_empty() {
        return Err(Failure::Declined("unsupported component deps debug plus policy".into()));
    }
    Ok(names)
}

pub(super) fn supported_policy(policy: &Value) -> bool {
    policy.is_null()
        || policy
            .as_object()
            .is_some_and(|map| {
                map.iter()
                    .all(|(key, value)| {
                        matches!(
                            key.as_str(),
                            "dependencies" | "devDependencies" | "peerDependencies",
                        ) && value
                            .as_object()
                            .is_some_and(|entries| entries.values().all(Value::is_string))
                    })
            })
}

pub(super) fn empty_policy(policy: &Value) -> bool {
    policy.is_null()
        || policy
            .as_object()
            .is_some_and(|fields| {
                fields
                    .values()
                    .all(|entries| entries.as_object().is_some_and(Map::is_empty))
            })
}

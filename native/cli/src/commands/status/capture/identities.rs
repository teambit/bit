//! Identity projection from detected dependency lifecycles.
//!
//! [`record`] populates [`Component`] comparison and [`full_identity`] entries inside [`Capture`].

use super::{Capture, Component, array, decline, full_identity, js, policy, text};
use serde_json::{Value, json};
use std::io;

/// Records the comparison metadata, dependency state, and [`Component`] row of one captured `target` into `captured`, including [`peer_identities`] and [`dependency_identities`].
pub(super) fn record(
    target: &Value,
    directory: &str,
    files: &[String],
    policy: &policy::Policy,
    dependencies: &Value,
    captured: &mut Capture,
) -> io::Result<()> {
    let current = policy::current_metadata(target, policy, dependencies)?;
    let version = target
        .get("version")
        .cloned()
        .unwrap_or(Value::Null);
    let mut entry = json!({
        "identity": target["identity"],
        "version": version,
        "directory": directory,
        "files": files,
        "current": current,
    });
    if let Some(version) = target.get("trackingVersion") {
        entry["trackingVersion"] = version.clone();
    }
    captured.dependency_states.insert(
        text(target.get("identity"))?.trim().to_string(),
        dependencies["state"].clone(),
    );
    if js::truthy(Some(&version)) {
        captured.comparisons.push(entry.clone());
    }
    let mut row = entry;
    row["peerDependencies"] = json!(peer_identities(dependencies)?);
    captured.captured.push(row);
    captured.components.push(Component {
        ignored: policy.ignored_issues()?,
        identity: full_identity(target)?,
        package_name: policy.package_name.clone(),
        dependencies: dependency_identities(dependencies)?,
        issues: policy.issues(dependencies)?,
    });
    Ok(())
}

/// The identities of the peer lifecycle.
#[inline]
pub(super) fn peer_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let lifecycles = array(state.get("components"), "dependency lifecycles")?;
    let peers = array(lifecycles.get(2), "peer dependencies")?;
    peers
        .iter()
        .map(|index| entry_identity_at(entries, index))
        .collect()
}

/// Every dependency identity, in lifecycle order.
#[inline]
pub(super) fn dependency_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let mut identities = Vec::with_capacity(entries.len());
    for indices in array(state.get("components"), "dependency lifecycles")? {
        for index in array(Some(indices), "dependency indices")? {
            identities.push(entry_identity_at(entries, index)?);
        }
    }
    Ok(identities)
}

/// Resolves the non-empty component identity at `index` within `entries`.
#[inline]
fn entry_identity_at(entries: &[Value], index: &Value) -> io::Result<String> {
    let entry = index
        .as_u64()
        .and_then(|offset| entries.get(offset as usize))
        .ok_or_else(|| decline("status dependency entry"))?;
    let identity = text(entry.get("identity"))?.trim();
    if identity.is_empty() {
        return Err(decline("status dependency entry identity"));
    }
    Ok(identity.to_string())
}

/// Returns `identity` stripped of any trailing `@version` suffix.
#[must_use]
#[inline]
pub(super) fn base_identity(identity: &str) -> &str {
    let identity = identity.trim();
    identity
        .rfind('@')
        .filter(|&separator| separator > 0)
        .map_or(identity, |separator| identity[..separator].trim())
}

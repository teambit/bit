//! Identity projection from detected dependency lifecycles.

use super::{Capture, Component, array, decline, full_identity, js, policy, text};
use serde_json::{Value, json};
use std::io;

/// The comparison and component rows of one captured target.
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
        text(target.get("identity"))?.to_string(),
        dependencies["state"].clone(),
    );
    let mut row = entry.clone();
    row["peerDependencies"] = json!(peer_identities(dependencies)?);
    captured.captured.push(row);
    if js::truthy(Some(&version)) {
        captured.comparisons.push(entry);
    }
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

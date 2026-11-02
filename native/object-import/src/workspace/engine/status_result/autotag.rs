//! Compute [`pending`] auto-tag candidates and dependency cycles for modified [`Target`] items.
use super::{Request, Target, invalid};
use serde_json::{Value, json};
use std::io;

/// Computes pending auto-tag candidates and dependency cycles for modified components in `request`.
pub(super) fn pending(request: &Request) -> io::Result<Value> {
    let changed: Vec<_> = request.targets
        .iter()
        .filter(|target| {
            target.modified
                && !target.version.trim().is_empty()
                && target.invalid.is_none()
        })
        .collect();
    if changed.is_empty() {
        return Ok(json!([]));
    }
    // Canonical graph inserts potential components before modified components.
    let ordered: Vec<_> = request.targets
        .iter()
        .filter(|target| {
            target.invalid.is_none() && (!target.modified || target.version.trim().is_empty())
        })
        .chain(changed.iter().copied())
        .collect();
    let components: Vec<_> = ordered
        .iter()
        .map(|target| row(target))
        .collect::<io::Result<_>>()?;
    let changed: Vec<_> = changed
        .iter()
        .map(|target| id(&target.identity, &target.version))
        .collect::<io::Result<_>>()?;
    let reply = crate::snapshot_transaction::apply(
        "snapshotAutoTag",
        json!({"components":components,"changed":changed,"semver":request.semver}),
        &mut crate::snapshot_transaction::State::default(),
    )?;
    selected(&reply, &ordered)
}
/// Maps auto-tag `reply` indices back to deduplicated component identities from `ordered`.
/// Skips unversioned targets that have not yet been snapped or tagged.
#[inline]
fn selected(reply: &Value, ordered: &[&Target]) -> io::Result<Value> {
    let results = reply["results"].as_array().ok_or_else(|| invalid("status autotag result"))?;
    let mut seen = std::collections::HashSet::with_capacity(results.len());
    let mut result = Vec::with_capacity(results.len());
    for entry in results {
        let raw = entry["component"].as_u64().ok_or_else(|| invalid("status autotag index"))?;
        let index = usize::try_from(raw).map_err(|_| invalid("status autotag index"))?;
        let target = ordered.get(index).ok_or_else(|| invalid("status autotag target"))?;
        let identity = target.identity.trim();
        if !target.version.trim().is_empty() && seen.insert(identity) {
            result.push(json!(identity));
        }
    }
    Ok(Value::Array(result))
}
/// Builds the `snapshotAutoTag` component row for `target`.
#[inline]
fn row(target: &Target) -> io::Result<Value> {
    let dependencies: Vec<_> = target.dependencies
        .iter()
        .map(|value| {
            let (identity, version) = value
                .rsplit_once('@')
                .unwrap_or((value, ""));
            id(identity, version)
        })
        .collect::<io::Result<_>>()?;
    Ok(json!({"id":id(&target.identity, &target.version)?,"dependencies":dependencies}))
}
/// Parses and validates a `<scope>/<name>[@<version>]` identity into a `{ scope, name, version? }` JSON object.
#[inline]
fn id(identity: &str, version: &str) -> io::Result<Value> {
    let identity = identity.trim();
    let version = version.trim();
    let (identity, inline_version) = identity
        .rsplit_once('@')
        .map_or((identity, ""), |(bare, ver)| (bare.trim(), ver.trim()));
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .ok_or_else(|| invalid("status autotag identity"))?;
    if scope.is_empty()
        || matches!(scope, "." | "..")
        || name.is_empty()
        || name
            .split('/')
            .any(|part| part.trim().is_empty() || matches!(part.trim(), "." | ".."))
    {
        return Err(invalid("status autotag identity"));
    }
    let effective_version = if version.is_empty() { inline_version } else { version };
    let mut output = json!({"scope":scope,"name":name});
    if !effective_version.is_empty() {
        output["version"] = json!(effective_version);
    }
    Ok(output)
}

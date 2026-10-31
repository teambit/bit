use super::{Request, Target, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn pending(request: &Request) -> io::Result<Value> {
    let changed: Vec<_> = request.targets
        .iter()
        .filter(|target| {
            target.modified && !target.version.is_empty() && target.invalid.is_none()
        })
        .collect();
    if changed.is_empty() {
        return Ok(json!([]));
    }
    // Canonical graph inserts potential components before modified components.
    let ordered: Vec<_> = request.targets
        .iter()
        .filter(|target| {
            target.invalid.is_none()
                && !changed
                    .iter()
                    .any(|other| other.identity == target.identity)
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
fn selected(reply: &Value, ordered: &[&Target]) -> io::Result<Value> {
    let mut result = Vec::new();
    for entry in reply["results"].as_array().ok_or_else(|| invalid("status autotag result"))? {
        let index =
            entry["component"].as_u64().ok_or_else(|| invalid("status autotag index"))? as usize;
        let target = ordered.get(index).ok_or_else(|| invalid("status autotag target"))?;
        if !target.version.is_empty() {
            result.push(json!(target.identity));
        }
    }
    Ok(Value::Array(result))
}
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
fn id(identity: &str, version: &str) -> io::Result<Value> {
    let (identity, inline_version) = identity
        .rsplit_once('@')
        .unwrap_or((identity, ""));
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("status autotag identity"))?;
    if scope.is_empty() || name.is_empty() {
        return Err(invalid("status autotag identity"));
    }
    let effective_version = if version.is_empty() { inline_version } else { version };
    let mut output = json!({"scope":scope,"name":name});
    if !effective_version.is_empty() {
        output["version"] = json!(effective_version);
    }
    Ok(output)
}

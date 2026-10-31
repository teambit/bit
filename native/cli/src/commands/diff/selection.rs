//! `idsByPattern` selection for workspace and historical diffs.

pub(super) use states::after_capture;
pub(in crate::commands) use states::{criterion, select_capture};

mod states;

use crate::commands::{
    inventory, patterns,
    status::js::{decline, text},
};
use serde_json::Value;
use std::io;

/// The pattern's target: by directory first, then by id or name.
pub(in crate::commands) fn select(
    targets: &[Value],
    pattern: Option<&str>,
) -> io::Result<Vec<Value>> {
    let Some(pattern) = pattern.map(str::trim) else {
        return Ok(targets.to_vec());
    };
    let active = matching(targets, |target| target["locallyRemoved"] != true);
    let targets = active.as_slice();
    if stateful(pattern) {
        return Ok(targets.to_vec());
    }
    if pattern.contains(['*', ',', '!']) {
        return glob(targets, pattern);
    }
    literal(targets, pattern)
}

fn literal(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    if pattern.is_empty()
        || !pattern
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_./-".contains(character))
    {
        return Err(decline("pattern outside the native grammar"));
    }
    let normalized = inventory::normalize(pattern);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let by_directory = matching(targets, |target| field(target, "directory") == directory);
    let selected = if by_directory.is_empty() {
        matching(targets, |target| {
            let identity = field(target, "identity");
            let name = identity
                .find('/')
                .map_or(identity, |slash| &identity[slash + 1..]);
            identity == pattern || name == pattern
        })
    } else {
        by_directory
    };
    if selected.len() != 1 {
        return Err(decline("the pattern does not select exactly one component"));
    }
    Ok(selected)
}

fn field<'v>(target: &'v Value, key: &str) -> &'v str {
    target
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
}

fn matching(targets: &[Value], keep: impl Fn(&Value) -> bool) -> Vec<Value> {
    targets
        .iter()
        .filter(|target| keep(target))
        .cloned()
        .collect()
}

fn glob(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let identities = targets
        .iter()
        .map(|target| text(target.get("identity")))
        .collect::<io::Result<Vec<_>>>()?;
    let matches = patterns::extended::matching(&identities, &patterns::split(pattern))?;
    if matches.is_empty() {
        return Err(decline("diff pattern has no matches"));
    }
    Ok(targets
        .iter()
        .filter(|target| {
            target["identity"]
                .as_str()
                .is_some_and(|id| matches.contains(&id))
        })
        .cloned()
        .collect())
}

pub(in crate::commands) fn stateful(pattern: &str) -> bool {
    patterns::split(pattern)
        .iter()
        .any(|part| part.starts_with('$') || part.contains(" AND "))
}

//! `idsByPattern` selection ([`select`], [`after_capture`], [`criterion`], [`select_capture`]) for workspace and historical diffs.
//!
//! Resolves literal directory/component names, glob patterns, and stateful predicates.

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

/// Resolves a literal component directory, ID, or name `pattern` against `targets`.
fn literal(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    if pattern.is_empty()
        || !pattern
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_./-".contains(character))
    {
        return Err(decline("pattern outside the native grammar"));
    }
    let normalized = inventory::normalize(pattern);
    let directory = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    let by_directory = matching(targets, |target| {
        let cand = inventory::normalize(field(target, "directory"));
        let cand = cand
            .strip_prefix("./")
            .unwrap_or(&cand)
            .trim_end_matches('/');
        !cand.is_empty() && cand == directory
    });
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

/// Extracts the trimmed string slice stored at `key` on `target`, or `""` when absent.
#[inline]
fn field<'v>(target: &'v Value, key: &str) -> &'v str {
    target
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
}

/// Clones all elements of `targets` that satisfy predicate `keep`.
#[inline]
fn matching(targets: &[Value], keep: impl Fn(&Value) -> bool) -> Vec<Value> {
    targets
        .iter()
        .filter(|target| keep(target))
        .cloned()
        .collect()
}

/// Resolves wildcard, comma-separated, or negated glob `pattern` segments against `targets`.
fn glob(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let identities = targets
        .iter()
        .map(|target| text(target.get("identity")).map(str::trim))
        .collect::<io::Result<Vec<_>>>()?;
    let matches = patterns::extended::matching(&identities, &patterns::split(pattern))?;
    if matches.is_empty() {
        return Err(decline("diff pattern has no matches"));
    }
    Ok(targets
        .iter()
        .zip(&identities)
        .filter(|(_, id)| matches.contains(*id))
        .map(|(target, _)| target.clone())
        .collect())
}

#[inline]
pub(in crate::commands) fn stateful(pattern: &str) -> bool {
    patterns::split(pattern)
        .iter()
        .any(|part| part.starts_with('$') || part.contains(" AND "))
}

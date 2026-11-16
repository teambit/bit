//! Unmerged component target selection via [`select`], [`pending_identities`], and [`identity`] for `merge --resolve` and `snap --unmerged`.
//! Enforces non-empty, deduplicated selections bounded to 4,096 pending workspace components.

#[cfg(test)]
mod tests;

use super::super::invalid;
use serde_json::Value;
use std::{collections::HashSet, io};

/// Pending order is observable for an unqualified resolve. Explicit patterns use
/// the canonical workspace matcher receipt, whose order is independently bound
/// to the authoritative workspace identity pool.
pub(super) fn select(
    targets: &[Value],
    pending: &[Value],
    pattern: Option<&[String]>,
) -> io::Result<Vec<String>> {
    let unresolved = pending_identities(pending)?;
    let selected = pattern.map_or_else(
        || unresolved.clone(),
        |list| {
            list.iter()
                .map(|id| id.trim().to_owned())
                .collect()
        },
    );
    if selected.is_empty() || selected.len() > 4096 {
        return Err(invalid("resolve empty or excessive selection"));
    }
    let mut seen = HashSet::with_capacity(selected.len());
    for id in &selected {
        if id.is_empty() || !seen.insert(id.as_str()) || !unresolved.contains(id) {
            return Err(invalid("resolve selection is not pending"));
        }
        if !has_target_identity(targets, id) {
            return Err(invalid("resolve selected component unavailable"));
        }
    }
    Ok(selected)
}

/// Extracts and deduplicates `scope/name` component identities from `pending` unmerged rows via [`identity`].
#[inline]
fn pending_identities(pending: &[Value]) -> io::Result<Vec<String>> {
    let mut unresolved = Vec::with_capacity(pending.len());
    let mut seen = HashSet::with_capacity(pending.len());
    for row in pending {
        let id = identity(&row["id"])?;
        if !seen.insert(id.clone()) {
            return Err(invalid("resolve duplicate pending identity"));
        }
        unresolved.push(id);
    }
    Ok(unresolved)
}

/// Parses and validates a bare `scope/name` component identity from string or `{scope, name}` `value` for [`pending_identities`].
pub(super) fn identity(value: &Value) -> io::Result<String> {
    let (scope, name) = if let Some(raw) = value.as_str() {
        let raw = raw.trim().trim_start_matches('/');
        let base = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        base.split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .ok_or_else(|| invalid("resolve identity scope"))?
    } else {
        let scope = value["scope"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("resolve identity scope"))?;
        let name = value["name"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("resolve identity name"))?;
        (scope, name)
    };
    if scope.is_empty() || name.is_empty() || scope.contains('/') || name.contains('@') {
        return Err(invalid("resolve identity"));
    }
    Ok(format!("{scope}/{name}"))
}

/// Returns `true` when `targets` contains a component entry with `identity` equal to `id` for [`select`].
#[inline]
fn has_target_identity(targets: &[Value], id: &str) -> bool {
    targets
        .iter()
        .any(|target| target["identity"].as_str().map(str::trim) == Some(id))
}

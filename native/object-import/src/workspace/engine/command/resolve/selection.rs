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
    let mut seen = HashSet::new();
    let selected = pattern.map_or_else(|| unresolved.clone(), <[String]>::to_vec);
    if selected.is_empty() || selected.len() > 4096 {
        return Err(invalid("resolve empty or excessive selection"));
    }
    for id in &selected {
        if !seen.insert(id.clone()) || !unresolved.contains(id) {
            return Err(invalid("resolve selection is not pending"));
        }
        if !has_target_identity(targets, id) {
            return Err(invalid("resolve selected component unavailable"));
        }
    }
    Ok(selected)
}

fn pending_identities(pending: &[Value]) -> io::Result<Vec<String>> {
    let mut unresolved = Vec::new();
    let mut seen = HashSet::new();
    for row in pending {
        let id = identity(&row["id"])?;
        if !seen.insert(id.clone()) {
            return Err(invalid("resolve duplicate pending identity"));
        }
        unresolved.push(id);
    }
    Ok(unresolved)
}

pub(super) fn identity(value: &Value) -> io::Result<String> {
    let (scope, name) = if let Some(raw) = value.as_str() {
        let raw = raw.trim();
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

fn has_target_identity(targets: &[Value], id: &str) -> bool {
    targets
        .iter()
        .any(|target| target["identity"] == id)
}

#[cfg(test)]
mod tests;

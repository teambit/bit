//! `VersionHistory` rebase intersection index calculation ([`plan`], [`validate_incoming`], [`Version`], [`references_valid`]) between existing and incoming versions.

use super::{hash, squash::references_valid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

/// Incoming `VersionHistory` entry (`hash`, `parents`, `unrelated`, `squashed`) for rebase planning.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Version {
    hash: String,
    parents: Vec<String>,
    unrelated: Option<String>,
    squashed: Option<Vec<String>>,
}
/// Finds the first intersection indices (`incomingIndex`, `existingIndex`) between `existing` and [`Version`] `incoming` as a [`Value`].
pub(super) fn plan(existing: &[String], incoming: &[Version]) -> io::Result<Value> {
    references_valid(existing)?;
    validate_incoming(incoming)?;
    if existing.is_empty() || incoming.is_empty() {
        return Ok(json!({}));
    }
    let mut existing_by_hash = std::collections::HashMap::with_capacity(existing.len());
    for (index, existing_hash) in existing.iter().enumerate() {
        existing_by_hash.entry(existing_hash.trim()).or_insert(index);
    }
    for (incoming_index, version) in incoming.iter().enumerate() {
        if let Some(&existing_index) = existing_by_hash.get(version.hash.trim()) {
            return Ok(json!({"incomingIndex":incoming_index,"existingIndex":existing_index}));
        }
    }
    Ok(json!({}))
}

/// Validates `incoming` ([`Version`]) count, unique SHA-1 hashes, non-self parents, and unrelated/squashed refs via [`references_valid`].
fn validate_incoming(incoming: &[Version]) -> io::Result<()> {
    if incoming.len() > 4096 {
        return Err(super::invalid("history rebase count limit"));
    }
    let mut seen = std::collections::HashSet::with_capacity(incoming.len());
    for version in incoming {
        let current = version.hash.trim();
        hash(current)?;
        if !seen.insert(current) {
            return Err(super::invalid("duplicate history rebase version"));
        }
        references_valid(&version.parents)?;
        if version.parents
            .iter()
            .any(|parent| parent.trim().eq_ignore_ascii_case(current))
        {
            return Err(super::invalid("history rebase self parent"));
        }
        if let Some(unrelated) = version.unrelated
            .as_deref()
            .map(str::trim)
            .filter(|val| !val.is_empty())
        {
            hash(unrelated)?;
        }
        if let Some(squashed) = &version.squashed {
            references_valid(squashed)?;
        }
    }
    Ok(())
}

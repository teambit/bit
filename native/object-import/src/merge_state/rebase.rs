use super::{hash, squash::references_valid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Version {
    hash: String,
    parents: Vec<String>,
    unrelated: Option<String>,
    squashed: Option<Vec<String>>,
}
pub(super) fn plan(existing: &[String], incoming: &[Version]) -> io::Result<Value> {
    references_valid(existing)?;
    validate_incoming(incoming)?;
    for (incoming_index, version) in incoming.iter().enumerate() {
        let target = version.hash.trim();
        if let Some(existing_index) = existing
            .iter()
            .position(|existing_hash| existing_hash.trim().eq_ignore_ascii_case(target))
        {
            return Ok(json!({"incomingIndex":incoming_index,"existingIndex":existing_index}));
        }
    }
    Ok(json!({}))
}

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

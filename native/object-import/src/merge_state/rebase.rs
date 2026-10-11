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
    if incoming.len() > 4096 {
        return Err(super::invalid("history rebase count limit"));
    }
    for version in incoming {
        hash(&version.hash)?;
        references_valid(&version.parents)?;
        if let Some(unrelated) = &version.unrelated {
            hash(unrelated)?;
        }
        if let Some(squashed) = &version.squashed {
            references_valid(squashed)?;
        }
    }
    for (incoming_index, version) in incoming.iter().enumerate() {
        if let Some(existing_index) = existing
            .iter()
            .position(|hash| hash == &version.hash)
        {
            return Ok(json!({"incomingIndex":incoming_index,"existingIndex":existing_index}));
        }
    }
    Ok(json!({}))
}

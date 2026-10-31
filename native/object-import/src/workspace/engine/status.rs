use std::{collections::HashMap, io};

use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct File {
    relative_path: String,
    hash: String,
}

/// Preserve first-match path lookup and target order, including duplicate paths.
pub(super) fn compare(target: &[File], current: &[File]) -> io::Result<(usize, Value)> {
    super::count(target.len())?;
    super::count(current.len())?;
    for file in target.iter().chain(current) {
        if file.relative_path.trim().is_empty()
            || file.relative_path.len() > 32768
            || file.relative_path.contains('\0')
        {
            return Err(super::invalid("workspace status path limit"));
        }
        super::expected_hash(&file.hash)?;
    }
    let mut paths = HashMap::with_capacity(current.len());
    for file in current {
        paths.entry(file.relative_path.trim()).or_insert(&file.hash);
    }
    let unchanged: Vec<bool> = target
        .iter()
        .map(|file| {
            paths
                .get(file.relative_path.trim())
                .is_some_and(|hash| hash.trim().eq_ignore_ascii_case(file.hash.trim()))
        })
        .collect();
    Ok((target.len(), json!({"unchanged":unchanged})))
}

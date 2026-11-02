//! Target and current [`File`] hash comparison via [`compare`] for workspace status.

use std::{collections::HashMap, io};

use serde::Deserialize;
use serde_json::{Value, json};

/// Relative path and SHA-1 hash pair for workspace status file comparisons.
///
/// Both fields are trimmed and validated before hash comparison.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct File {
    relative_path: String,
    hash: String,
}

/// Preserve first-match path lookup and target order, including duplicate paths.
///
/// Hash comparisons are ASCII case-insensitive after trimming.
#[inline]
pub(super) fn compare(target: &[File], current: &[File]) -> io::Result<(usize, Value)> {
    super::count(target.len())?;
    super::count(current.len())?;
    let mut path_bytes = 0_usize;
    for file in target.iter().chain(current) {
        path_bytes = path_bytes
            .checked_add(file.relative_path.len())
            .filter(|bytes| *bytes <= super::MAX_RAW)
            .ok_or_else(|| super::invalid("workspace status path limit"))?;
        if file.relative_path.trim().is_empty()
            || file.relative_path.len() > 32768
            || file.relative_path.chars().any(char::is_control)
        {
            return Err(super::invalid("workspace status path limit"));
        }
        super::expected_hash(&file.hash)?;
    }
    let mut paths = HashMap::with_capacity(current.len());
    for file in current {
        paths.entry(file.relative_path.trim()).or_insert_with(|| file.hash.trim());
    }
    let unchanged: Vec<bool> = target
        .iter()
        .map(|file| {
            paths
                .get(file.relative_path.trim())
                .is_some_and(|hash| hash.eq_ignore_ascii_case(file.hash.trim()))
        })
        .collect();
    Ok((target.len(), json!({"unchanged":unchanged})))
}

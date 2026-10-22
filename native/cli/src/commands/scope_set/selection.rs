//! Component-pattern resolution and scope-name validation for `bit scope set`.

use super::{
    super::{color::Chalk, inventory, patterns},
    Failure,
};
use crate::workspace;
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::Value;
use std::{fs, path::Path};

pub(in crate::commands) fn resolve_pattern_entries<'a>(
    root: &Path,
    bitmap: &'a Bitmap,
    pattern: &str,
    chalk: Chalk,
) -> Result<Vec<&'a BitmapEntry>, Failure> {
    if !pattern.contains(['*', ',', '!', '$', ':']) {
        return resolve_literal_entry(root, bitmap, pattern, chalk);
    }
    let active = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .collect::<Vec<_>>();
    let identities = active
        .iter()
        .map(|entry| entry.id.to_string_without_version())
        .collect::<Vec<_>>();
    let identity_refs = identities
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let matched = patterns::extended::matching(&identity_refs, &patterns::split(pattern))?;
    if matched.is_empty() {
        return Err(Failure::User(format!(
            r#"unable to find any component matching the "{pattern}" pattern"#,
        )));
    }
    Ok(matched
        .into_iter()
        .filter_map(|identity| {
            active
                .iter()
                .copied()
                .find(|entry| entry.id.to_string_without_version() == identity)
        })
        .collect())
}

fn resolve_literal_entry<'a>(
    root: &Path,
    bitmap: &'a Bitmap,
    pattern: &str,
    chalk: Chalk,
) -> Result<Vec<&'a BitmapEntry>, Failure> {
    let normalized = inventory::normalize(pattern);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let found = bitmap.entries
        .iter()
        .find(|entry| !entry.root_dir.is_empty() && entry.root_dir == directory)
        .or_else(|| {
            bitmap.entries
                .iter()
                .find(|entry| {
                    entry.id.to_string_without_version() == pattern || entry.id.name == pattern
                })
        });
    if let Some(entry) = found.filter(|entry| entry.owns_its_dir()) {
        return Ok(vec![entry]);
    }
    if found.is_some() || is_known_scope_or_valid_scoped_id(root, pattern)? {
        return Err(Failure::User(format!(
            "error: component \"{}\" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit create' (see 'bit create --help' for more information)",
            chalk.bold(pattern),
        )));
    }
    Err(Failure::User(format!(
        r#"error: component ID "{pattern}" is invalid, please use the following format: [scope]/<name>"#,
    )))
}

fn is_known_scope_or_valid_scoped_id(root: &Path, pattern: &str) -> Result<bool, Failure> {
    if let Some((scope, name)) = pattern.split_once('/') {
        if valid_scope_str(scope) && valid_id_chunk(name) {
            return Ok(true);
        }
        return Err(Failure::Declined("invalid scoped component id".to_owned()));
    }
    Ok(!pattern.contains('.') && exists_in_scope_index(root, pattern))
}

fn exists_in_scope_index(root: &Path, name: &str) -> bool {
    let Ok(bytes) = fs::read(workspace::scope_path(root).join("index.json")) else {
        return false;
    };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else {
        return false;
    };
    index["components"]
        .as_array()
        .is_some_and(|components| {
            components
                .iter()
                .any(|item| item["id"]["name"].as_str() == Some(name))
        })
}

fn valid_id_chunk(chunk: &str) -> bool {
    !chunk.is_empty()
        && !chunk.contains("//")
        && chunk
            .chars()
            .all(|ch| {
                ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '_' | '/')
            })
}

pub(in crate::commands) fn valid_scope_str(scope: &str) -> bool {
    scope.len() >= 2
        && !scope.starts_with('.')
        && !scope.ends_with('.')
        && scope
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
        && scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"$-_!.".contains(&byte)
            })
}

pub(super) fn validate_scope_name(scope: &str) -> Result<(), Failure> {
    if valid_scope_str(scope) {
        return Ok(());
    }
    Err(Failure::User(format!(
        r#"error: "{scope}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
    )))
}

pub(in crate::commands) fn entry_full_id(entry: &BitmapEntry) -> String {
    let identity = entry.id.to_string_without_version();
    match &entry.id.version {
        Some(version) if !version.is_empty() && version != "latest" => {
            format!("{identity}@{version}")
        }
        _ => identity,
    }
}

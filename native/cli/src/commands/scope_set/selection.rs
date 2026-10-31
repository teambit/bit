//! Component-pattern resolution and scope-name validation for `bit scope set`.

use super::{
    super::{color::Chalk, inventory, patterns},
    Failure,
};
use crate::workspace;
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

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
    if pattern.starts_with('@') {
        return Err(Failure::Declined("package name selector".to_owned()));
    }
    let bare = pattern.rsplit_once('@').map_or(pattern, |(id, _)| id);
    if bare.is_empty() {
        return Err(Failure::Declined("empty component id".to_owned()));
    }
    let normalized = inventory::normalize(bare);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let found = bitmap.entries
        .iter()
        .find(|entry| !entry.root_dir.is_empty() && entry.root_dir == directory)
        .or_else(|| {
            bitmap.entries
                .iter()
                .find(|entry| {
                    entry.id.to_string_without_version() == bare || entry.id.name == bare
                })
        });
    if let Some(entry) = found.filter(|entry| entry.owns_its_dir()) {
        return Ok(vec![entry]);
    }
    if found.is_some() || is_known_scope_or_valid_scoped_id(root, bare)? {
        return Err(Failure::User(format!(
            "error: component \"{}\" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit create' (see 'bit create --help' for more information)",
            chalk.bold(pattern),
        )));
    }
    Err(Failure::User(format!(
        r#"error: component ID "{bare}" is invalid, please use the following format: [scope]/<name>"#,
    )))
}

fn is_known_scope_or_valid_scoped_id(root: &Path, pattern: &str) -> Result<bool, Failure> {
    if let Some((scope, name)) = pattern.split_once('/') {
        validate_scope_name(scope)?;
        validate_component_name(name)?;
        return Ok(true);
    }
    Ok(!pattern.contains('.') && exists_in_scope_index(root, pattern))
}

pub(in crate::commands) fn exists_in_scope_index(root: &Path, name: &str) -> bool {
    let Ok(bytes) = fs::read(workspace::scope_path(root).join("index.json")) else {
        return false;
    };
    let Ok(index) = bit_object_import::parse_jsonc(&bytes) else {
        return false;
    };
    index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .is_some_and(|components| {
            components
                .iter()
                .any(|item| item["isSymlink"] != true && row_has_name(item, name))
        })
}

pub(in crate::commands) fn row_has_name(row: &Value, name: &str) -> bool {
    let name = name.trim();
    row["id"]["name"].as_str().map(str::trim) == Some(name)
        || row["id"]
            .as_str()
            .map(str::trim)
            .map(|raw| raw.split('@').next().unwrap_or(raw))
            .is_some_and(|bare| {
                bare == name
                    || bare
                        .split_once('/')
                        .is_some_and(|(_, nm)| nm == name)
            })
}

pub(in crate::commands) fn valid_id_chunk(chunk: &str) -> bool {
    !chunk.is_empty()
        && !chunk.contains("//")
        && chunk
            .chars()
            .all(|ch| {
                ch.is_ascii_lowercase()
                    || ch.is_ascii_digit()
                    || matches!(ch, '-' | '_' | '$' | '!' | '/')
            })
}

pub(in crate::commands) fn validate_component_name(name: &str) -> Result<(), Failure> {
    if valid_id_chunk(name) {
        return Ok(());
    }
    Err(Failure::User(format!(
        r#"error: "{name}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]"#,
    )))
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

pub(in crate::commands) fn validate_scope_name(scope: &str) -> Result<(), Failure> {
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
        Some(version) if !version.is_empty() && !matches!(version.as_str(), "latest" | "head") => {
            format!("{identity}@{version}")
        }
        _ => identity,
    }
}

pub(super) fn publish_workspace_default_scope(
    root: &Path,
    before: &[u8],
    key: &str,
    scope: &str,
    file_id: &str,
) -> io::Result<()> {
    let text = std::str::from_utf8(before).map_err(io::Error::other)?;
    let mut document = bit_workspace_config::jsonc::Document::parse(text)?;
    document.set(&[key, "defaultScope"], &json!(scope));
    let _ = backup_workspace_config(root, before, scope, file_id);
    let rendered = format!("{document}\n");
    let bytes = if cfg!(windows)
        && before
            .windows(2)
            .any(|pair| pair == b"\r\n")
    {
        rendered.replace('\n', "\r\n").into_bytes()
    } else {
        rendered.into_bytes()
    };
    fs::write(root.join("workspace.jsonc"), bytes)
}

fn backup_workspace_config(
    root: &Path,
    before: &[u8],
    scope: &str,
    file_id: &str,
) -> io::Result<()> {
    let directory = workspace::scope_path(root).join("workspace-config-history");
    fs::create_dir_all(directory.join("files"))?;
    fs::write(directory.join("files").join(file_id), before)?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} default-scope ({scope})")
}

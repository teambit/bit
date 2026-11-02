//! Compilation [`batch_size`] and file budget limits for [`Compiled`] components.
//!
//! Reads `concurrency.io` from layered workspace/scope/global config stores.

use super::Compiled;
use bit_workspace_config::{config_string, effective, global_config_dir, read_global_config};
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::Path};

/// Resolves the `concurrency.io` batch size limit for workspace compilation via [`parse_concurrency_limit`].
pub(super) fn batch_size(root: &Path) -> io::Result<usize> {
    let global = read_global_config(&global_config_dir())?;
    let scope = read(&bit_object_import::scope_path(root).join("scope.json"))?;
    let workspace = read(&root.join("workspace.jsonc"))?;
    let ws_store =
        crate::commands::update_cmd::aspect_entry(&workspace, "teambit.harmony/config-store")
            .map_or(&Value::Null, |(_, val)| val);
    let values = effective(&global, &scope["config"], ws_store, &["concurrency.io"]);
    let value = values
        .get("concurrency.io")
        .and_then(config_string)
        .unwrap_or_default();
    parse_concurrency_limit(&value)
}

/// Parses the `concurrency.io` configuration string into a bounded `[1, 256]` batch limit.
#[inline]
fn parse_concurrency_limit(value: &str) -> io::Result<usize> {
    let trimmed = value.trim();
    let number = if trimmed.is_empty() {
        100
    } else {
        trimmed
            .parse::<usize>()
            .map_err(|_| io::Error::other("compiler I/O concurrency configuration"))?
    };
    let number = if number == 0 { 100 } else { number };
    if number > 256 {
        return Err(io::Error::other("compiler I/O concurrency limit"));
    }
    Ok(number)
}
/// Reads and parses a JSONC configuration file at `path`, returning `Value::Null` when absent.
#[inline]
fn read(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
/// Validates that all [`Compiled`] component identities are non-empty and output paths do not collide or escape.
pub(super) fn outputs(compiled: &[Compiled]) -> io::Result<()> {
    let total_files = compiled
        .iter()
        .map(|row| row.files.len())
        .sum();
    let mut paths = HashSet::with_capacity(total_files);
    for row in compiled {
        if row.identity.trim().is_empty() {
            return Err(io::Error::other("compiler empty component identity"));
        }
        for file in &row.files {
            if file.path
                .as_os_str()
                .as_encoded_bytes()
                .iter()
                .all(u8::is_ascii_whitespace)
                || file.path
                    .components()
                    .any(|part| matches!(part, std::path::Component::ParentDir))
                || !paths.insert(&file.path)
            {
                return Err(io::Error::other("compiler colliding outputs"));
            }
        }
    }
    Ok(())
}

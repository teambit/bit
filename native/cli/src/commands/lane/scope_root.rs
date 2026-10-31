//! A lane inspection can start in a workspace or directly in a bare scope.
use crate::{
    commands::{color::Chalk, debug_cat::sha1_hex},
    workspace,
};
use serde_json::Value;
use std::{
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

pub(crate) struct ScopeRoot {
    pub(crate) path: PathBuf,
    pub(crate) bare: bool,
}

pub(crate) fn discover() -> io::Result<Option<ScopeRoot>> {
    let cwd = env::current_dir()?;
    if let Some(path) = workspace::root(&cwd) {
        return read(&path, false).map(Some);
    }
    for path in cwd.ancestors() {
        if path.join("scope.json").is_file() {
            return read(path, true).map(Some);
        }
    }
    Ok(None)
}

fn read(path: &Path, bare: bool) -> io::Result<ScopeRoot> {
    let directory = if bare { path.to_owned() } else { bit_object_import::scope_path(path) };
    if !directory.join("objects").is_dir() {
        return Err(io::Error::other("lane scope objects directory absent"));
    }
    let bytes = fs::read(directory.join("scope.json"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(io::Error::other("lane scope configuration limit"));
    }
    let scope = bit_object_import::parse_jsonc(&bytes)?;
    scope["name"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains('/'))
        .ok_or_else(|| io::Error::other("lane scope name"))?;
    if bare {
        validate_bare_index(&directory)?;
    }
    Ok(ScopeRoot { path: path.to_owned(), bare })
}

fn validate_bare_index(directory: &Path) -> io::Result<()> {
    let path = directory.join("index.json");
    if !path.is_file() {
        return Ok(());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(io::Error::other("lane scope index limit"));
    }
    let index = bit_object_import::parse_jsonc(&bytes)?;
    if !index.is_array() && (!index["components"].is_array() || !index["lanes"].is_array()) {
        return Err(io::Error::other("lane scope index"));
    }
    Ok(())
}

pub(in crate::commands) fn diagnose_component_lookup_error(
    scope_dir: &Path,
    raw_id: &str,
    bare_id: &str,
    chalk: Chalk,
) -> Option<String> {
    if raw_id.starts_with('@') || bare_id.is_empty() {
        return None;
    }
    let index = bit_object_import::parse_jsonc(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let comps = index["components"].as_array().or_else(|| index.as_array())?;
    let object_exists = bit_object_import::read_scope_object(scope_dir, &sha1_hex(bare_id))
        .ok()
        .flatten()
        .is_some();
    if object_exists {
        return None;
    }
    if let Some((scope, name)) = bare_id.split_once('/') {
        let scope = scope.trim();
        let name = name.trim();
        if scope.is_empty() || name.is_empty() || name.contains('/') {
            return None;
        }
        let display_id = raw_id
            .strip_suffix("@latest")
            .or_else(|| raw_id.strip_suffix("@head"))
            .unwrap_or(raw_id);
        return Some(format!(r#"error: component "{}" was not found"#, chalk.bold(display_id)));
    }
    diagnose_unscoped_component_error(comps, raw_id, bare_id)
}

fn diagnose_unscoped_component_error(
    comps: &[Value],
    raw_id: &str,
    bare_id: &str,
) -> Option<String> {
    let raw_id = raw_id.trim();
    if bare_id.contains('.') {
        return None;
    }
    match comps
        .iter()
        .filter(|row| row["isSymlink"] != true && row_has_name(row, bare_id))
        .count()
    {
        0 => Some(format!("scope.getParsedId, the component {raw_id} must include a scope-name")),
        count if count > 2 => Some("getHashFromIndex expect to get zero or one result".to_owned()),
        _ => None,
    }
}

fn row_has_name(row: &Value, bare_id: &str) -> bool {
    let target = bare_id.trim();
    row["id"]["name"].as_str().map(str::trim) == Some(target)
        || row["id"]
            .as_str()
            .is_some_and(|id_str| {
                let trimmed = id_str.trim();
                let without_ver = trimmed.rsplit_once('@').map_or(trimmed, |(bare, _)| bare.trim());
                without_ver.rsplit_once('/').map_or(without_ver, |(_, nm)| nm.trim()) == target
            })
}

#[expect(clippy::too_many_arguments, reason = "Diagnostics share resolved head and version hashes")]
pub(in crate::commands) fn diagnose_version_error(
    scope_dir: &Path,
    comp_id: &str,
    comp_val: &Value,
    ver: &str,
    lane_head: Option<&str>,
    head_label: Option<&str>,
    resolved_hash: Option<&str>,
    chalk: Chalk,
) -> Option<String> {
    if matches!(ver, "latest" | "head") {
        let ver_hash = lane_head.or_else(|| comp_val["head"].as_str())?;
        let ver_label = head_label.unwrap_or(ver_hash);
        return bit_object_import::read_scope_object(scope_dir, ver_hash)
            .ok()?
            .is_none()
            .then(|| missing_version_on_fs_msg(ver_label, comp_id));
    }
    let Some(ver_hash) = resolved_hash else {
        return Some(format!(
            r#"error: version "{}" of component {} was not found."#,
            chalk.bold(ver),
            chalk.bold(comp_id),
        ));
    };
    bit_object_import::read_scope_object(scope_dir, ver_hash)
        .ok()?
        .is_none()
        .then(|| missing_version_on_fs_msg(ver, comp_id))
}

fn missing_version_on_fs_msg(ver: &str, comp_id: &str) -> String {
    format!(
        "error: version \"{ver}\" of component {comp_id} was not found on the filesystem.\ntry running \"bit import\". if it doesn't help, try running \"bit import {comp_id} --objects\"",
    )
}

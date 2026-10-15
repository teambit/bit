//! Progress messages emitted by the source CLI while preparing a diff.

use super::options;
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn render_progress(
    output: &bit_install::output::Output,
    root: &Path,
    options: &options::Options,
    result: &Value,
    loaded: usize,
) {
    if loaded > 0 {
        output.status(&format!("loading {loaded} component(s)"));
    }
    if imports(root, options, result) {
        let qualifier = if multi_version_import(options, result) { ", 2 versions" } else { "" };
        output.status(&format!("importing {loaded} components{qualifier} to show diff"));
        output.status(&format!("successfully imported {loaded} components to show diff"));
    }
    if options.pattern.is_none()
        && let Some(rows) = result.as_array()
        && !rows.is_empty()
    {
        output.status(&format!("loading {} component(s)", rows.len()));
    }
}

/// Whether the versions to compare are fetched first (`importWithoutDeps`), which
/// fetches nothing for a component that is not exported.
fn imports(root: &Path, options: &options::Options, result: &Value) -> bool {
    let versions = &options.versions;
    let fetches =
        if versions.parent { foreign_tagged_target(root, result) } else { versions.from.is_some() };
    fetches && exported_target(root, result)
}

/// `scope.isExported`: some compared component's `.bitmap` entry has its own scope
/// (`getNotExportedIds` lists the entries without one).
fn exported_target(root: &Path, result: &Value) -> bool {
    let exported = exported_ids(root);
    result
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| row["id"].as_str())
        .any(|id| exported.iter().any(|known| known == id))
}

/// `scope/name` of the `.bitmap` entries with their own scope.
fn exported_ids(root: &Path) -> Vec<String> {
    let bitmap = fs::read_to_string(root.join(".bitmap"))
        .ok()
        .and_then(|text| bit_install::jsonc::parse(&text).ok())
        .unwrap_or_default();
    bitmap
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(_, entry)| {
            let scope = entry["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())?;
            Some(format!("{scope}/{}", entry["name"].as_str()?))
        })
        .collect()
}

fn foreign_tagged_target(root: &Path, result: &Value) -> bool {
    let Some(scope) = fs::read(root.join(".bit/scope.json"))
        .ok()
        .and_then(|body| serde_json::from_slice::<Value>(&body).ok())
        .and_then(|value| value["name"].as_str().map(str::to_string))
    else {
        return false;
    };
    result
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    let identity = row["id"].as_str().unwrap_or_default();
                    let version = row["_fullId"]
                        .as_str()
                        .and_then(|id| id.rsplit_once('@'))
                        .map(|(_, version)| version)
                        .unwrap_or_default();
                    !(identity.starts_with(&format!("{scope}/"))
                        || version.len() == 40
                            && version.bytes().all(|byte| byte.is_ascii_hexdigit()))
                })
        })
}

fn multi_version_import(options: &options::Options, result: &Value) -> bool {
    let Some(from) = &options.versions.from else {
        return false;
    };
    let current = result[0]["_fullId"]
        .as_str()
        .and_then(|id| id.rsplit_once('@'));
    current.is_some_and(|(_, version)| {
        let to = options.versions.to.as_deref().unwrap_or(version);
        from != to && (version.len() != 40 || !version.bytes().all(|byte| byte.is_ascii_hexdigit()))
    })
}

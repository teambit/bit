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
    if (!options.versions.parent && options.versions.from.is_some())
        || (options.versions.parent && foreign_tagged_target(root, result))
    {
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

//! Workspace-level merge and permitted Harmony load diagnostics.
//!
//! [`collect`] inspects [`MergeConfig`] conflicts and [`Capture`] callback diagnostics at [`Path`] roots.

use super::capture::{self, Capture};
use bit_install::config::MergeConfig;
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn collect(root: &Path, capture: &Capture) -> io::Result<Vec<String>> {
    let mut issues = Vec::new();
    if MergeConfig::load(root)?.has_conflict("WORKSPACE") {
        issues.push(format!(
            "unable to parse the merge-conflict file {} as it has unresolved conflicts",
            root.join("merge-conflict").display(),
        ));
    }
    for message in capture::workspace_issues(capture)? {
        let trimmed = message.trim();
        if !trimmed.is_empty()
            && !issues
                .iter()
                .any(|existing| existing == trimmed)
        {
            issues.push(trimmed.to_owned());
        }
    }
    Ok(issues)
}

/// Validate `workspace.jsonc` for invalid top-level keys, conflicting rootComponent, or unknown core harmony aspects in variants.
pub(super) fn config_error(root: &Path) -> Option<String> {
    let bytes = std::fs::read(root.join("workspace.jsonc")).ok()?;
    let ws = bit_object_import::parse_jsonc(&bytes).ok()?;
    if let Some((_, dep_resolver)) =
        crate::commands::update_cmd::aspect_entry(&ws, "teambit.dependencies/dependency-resolver")
        && dep_resolver["externalPackageManager"] == true
        && dep_resolver["rootComponent"] == true
    {
        return Some(
            "rootComponent cannot be true when externalPackageManager is enabled".to_owned(),
        );
    }
    let obj = ws.as_object()?;
    invalid_top_level_key(obj).or_else(|| unknown_variant_harmony_aspect(obj))
}

#[inline]
fn invalid_top_level_key(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let key = obj
        .keys()
        .find(|key| {
            let trimmed = key.trim();
            trimmed != "$schema"
                && !trimmed
                    .split_once('/')
                    .is_some_and(|(scope, name)| {
                        !scope.trim().is_empty() && !name.trim().is_empty()
                    })
        })?;
    Some(format!(r#"unable to parse the component-id "{key}" from the workspace.jsonc file"#))
}

#[inline]
fn unknown_variant_harmony_aspect(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let variants = obj
        .iter()
        .find(|(key, _)| is_variants_aspect_key(key))?
        .1
        .as_object()?;
    let aspect_key = variants
        .values()
        .filter_map(Value::as_object)
        .flat_map(serde_json::Map::keys)
        .find(|aspect_key| is_unknown_harmony_aspect(aspect_key))?;
    Some(format!(
        r#"error: component "{aspect_key}" was not found.
your workspace.jsonc has this component-id set in the "teambit.workspace/variants" section"#,
    ))
}

#[inline]
fn is_unknown_harmony_aspect(aspect_key: &str) -> bool {
    let bare = bit_install::config::aspect_id_without_version(aspect_key.trim());
    bare.starts_with("teambit.harmony/")
        && !matches!(bare, "teambit.harmony/bit-custom-aspect" | "teambit.harmony/harmony")
        && !include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json")
            .split('"')
            .any(|core_id| core_id == bare)
}

#[inline]
fn is_variants_aspect_key(key: &str) -> bool {
    let trimmed = key.trim();
    trimmed == "teambit.workspace/variants" || trimmed.starts_with("teambit.workspace/variants@")
}

//! Workspace-level merge and permitted Harmony load diagnostics.

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
        if !issues.contains(&message) {
            issues.push(message);
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

fn invalid_top_level_key(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let key = obj
        .keys()
        .find(|key| *key != "$schema" && !key.contains('/'))?;
    Some(format!(r#"unable to parse the component-id "{key}" from the workspace.jsonc file"#))
}

fn unknown_variant_harmony_aspect(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let variants = obj
        .iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.workspace/variants"
                || key.starts_with("teambit.workspace/variants@")
        })?
        .1
        .as_object()?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .unwrap_or_default();
    let aspect_key = variants
        .values()
        .filter_map(Value::as_object)
        .flat_map(serde_json::Map::keys)
        .find(|aspect_key| is_unknown_harmony_aspect(aspect_key, &core))?;
    Some(format!(
        r#"error: component "{aspect_key}" was not found.
your workspace.jsonc has this component-id set in the "teambit.workspace/variants" section"#,
    ))
}

fn is_unknown_harmony_aspect(aspect_key: &str, core: &[String]) -> bool {
    let bare = aspect_key
        .split('@')
        .next()
        .unwrap_or(aspect_key);
    bare.starts_with("teambit.harmony/")
        && !core
            .iter()
            .any(|core_id| core_id == bare)
        && !matches!(bare, "teambit.harmony/bit-custom-aspect" | "teambit.harmony/harmony")
}

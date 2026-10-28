use super::{Value, invalid, json};
use crate::commands::workspace_command::component_service::Component;
use bit_install::{
    config::WorkspaceConfig,
    dependencies::{DevPatternConfig, EnvDevPatterns, dev_patterns, glob},
    workspace::Workspace,
};
use std::{fs, io, path::Path};

pub(super) fn request(
    root: &Path,
    selected: &Component,
    environment: &str,
) -> io::Result<Option<Value>> {
    let patterns = patterns(root, selected)?;
    let has_tests = selected.files
        .iter()
        .any(|file| {
            file["filePath"].as_str().is_some_and(|file| glob::match_patterns(file, &patterns))
        });
    if !has_tests {
        return Ok(None);
    }
    let mut config: Value = serde_json::from_str(include_str!("config.json"))?;
    config["rootDir"] = json!(root);
    config["roots"] = json!([root]);
    config["testMatch"] = json!(
        patterns
            .iter()
            .map(|pattern| absolute_pattern(&root.join(&selected.directory), pattern))
            .collect::<Vec<_>>()
    );
    if environment == "teambit.react/react" {
        config["testEnvironment"] = json!("$jsdom");
        config["setupFiles"] = json!(["$polyfill"]);
    }
    Ok(Some(json!({"root":root,"config":config})))
}
fn patterns(root: &Path, selected: &Component) -> io::Result<Vec<String>> {
    let raw: Value = bit_object_import::parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    let config = WorkspaceConfig::load(root).map_err(io::Error::other)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load(root, &config, &core).map_err(io::Error::other)?;
    let (_, component) = workspace
        .active()
        .find(|(entry, _)| entry.root_dir == selected.directory)
        .ok_or_else(|| invalid("tester component patterns"))?;
    let configured = DevPatternConfig::from_aspects(&|id| raw.get(id).cloned());
    Ok(dev_patterns(component, &configured, &EnvDevPatterns::default())
        .shift_remove("teambit.defender/tester")
        .unwrap_or_default())
}

fn absolute_pattern(directory: &Path, pattern: &str) -> String {
    let (prefix, relative) = pattern
        .strip_prefix('!')
        .map_or(("", pattern), |value| ("!", value));
    format!("{prefix}{}", directory.join(relative).display())
}

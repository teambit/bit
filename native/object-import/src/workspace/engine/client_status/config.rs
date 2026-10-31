pub(crate) use bitmap::is_config_removed;
pub(in crate::workspace::engine) use bitmap::{
    context_bitmap_targets, context_targets, inactive_targets, targets,
};

use super::invalid;
use crate::recovery::jsonc;
use bitmap::identifier;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

mod bitmap;

const PREVIEW: &str = "teambit.preview/preview";
const ISSUES: &str = "teambit.component/issues";

/// The keys of `IssuesClasses` (`@teambit/component-issues`).
const ISSUE_CLASSES: [&str; 24] = [
    "MissingPackagesDependenciesOnFs",
    "MissingManuallyConfiguredPackages",
    "UntrackedDependencies",
    "ResolveErrors",
    "RelativeComponents",
    "RelativeComponentsAuthored",
    "ParseErrors",
    "MissingDists",
    "LegacyInsideHarmony",
    "MissingDependenciesOnFs",
    "ImportNonMainFiles",
    "MultipleEnvs",
    "MissingLinksFromNodeModulesToSrc",
    "CircularDependencies",
    "DuplicateComponentAndPackage",
    "MergeConfigHasConflict",
    "NonLoadedEnv",
    "ExternalEnvWithoutVersion",
    "RemovedDependencies",
    "RemovedEnv",
    "DeprecatedDependencies",
    "SelfReference",
    "ImportFromDirectory",
    "LoadFailures",
];

pub(in crate::workspace::engine) fn configuration(root: &Path) -> io::Result<Value> {
    configuration_for_command(root, false)
}
pub(in crate::workspace::engine) fn configuration_for_command(
    root: &Path,
    lane: bool,
) -> io::Result<Value> {
    let config = document(&root.join("workspace.jsonc"))?;
    configuration_value(root, &config, lane)
}
pub(in crate::workspace::engine) fn configuration_value(
    root: &Path,
    config: &Value,
    lane: bool,
) -> io::Result<Value> {
    let object = config.as_object().ok_or_else(|| invalid("status workspace configuration"))?;
    if object
        .keys()
        .any(|key| {
            let bare = key.split('@').next().unwrap_or(key);
            !matches!(
                bare,
                "$schema"
                    | "teambit.workspace/workspace"
                    | "teambit.generator/generator"
                    | "teambit.dependencies/dependency-resolver"
                    | "teambit.workspace/workspace-config-files"
                    | "teambit.workspace/variants"
                    | "teambit.pkg/pkg"
                    | PREVIEW
                    | ISSUES,
            ) && (!key.contains('/') || !config[key].is_object())
        })
    {
        return Err(invalid("status configured extensions require Harmony"));
    }
    let workspace = workspace_settings(config)?;
    extensions(config)?;
    let scope = document(&crate::scope_path(root).join("scope.json"))?;
    if !lane && scope["lanes"]["current"] != "main" {
        return Err(invalid("status non-main scope"));
    }
    if !fs::symlink_metadata(crate::scope_path(root).join("objects"))?.is_dir() {
        return Err(invalid("status object directory"));
    }
    Ok(workspace)
}

fn aspect_value<'a>(config: &'a Value, id: &str) -> Option<&'a Value> {
    let prefix = format!("{id}@");
    config
        .as_object()
        .and_then(|map| {
            map.get(id)
                .or_else(|| {
                    map.iter()
                        .find_map(|(key, val)| key.starts_with(&prefix).then_some(val))
                })
        })
}

fn workspace_settings(config: &Value) -> io::Result<Value> {
    let workspace = aspect_value(config, "teambit.workspace/workspace")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("status workspace settings"))?;
    identifier(
        workspace
            .get("defaultScope")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("status workspace default scope"))?,
        false,
    )?;
    if workspace
        .get("trackAllFiles")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("status invalid trackAllFiles"));
    }
    ignored_files(workspace.get("ignoredFiles"))?;
    Ok(Value::Object(workspace.clone()))
}
fn ignored_files(ignored: Option<&Value>) -> io::Result<()> {
    if let Some(ignored) = ignored {
        let patterns = ignored.as_array().ok_or_else(|| invalid("status ignoredFiles"))?;
        if patterns.len() > 4096
            || patterns
                .iter()
                .any(|pattern| !pattern.is_string())
        {
            return Err(invalid("status ignoredFiles limit"));
        }
    }
    Ok(())
}
fn extensions(config: &Value) -> io::Result<()> {
    for name in
        ["teambit.generator/generator", "teambit.workspace/workspace-config-files", PREVIEW, ISSUES]
    {
        if aspect_value(config, name).is_some_and(|value| !value.is_object()) {
            return Err(invalid("status aspect settings"));
        }
    }
    // Resolver installation options do not change read-side dependency policy.
    // Policy and package resolution are validated by their native readers.
    if aspect_value(config, "teambit.dependencies/dependency-resolver")
        .is_some_and(|resolver| !resolver.is_object())
    {
        return Err(invalid("status dependency resolver settings"));
    }
    configured_environments(config)?;
    // Only previews and builds read the preview settings.
    if aspect_value(config, PREVIEW)
        .and_then(|preview| preview.get("disabled"))
        .is_some_and(|disabled| !disabled.is_boolean())
    {
        return Err(invalid("status preview settings require Harmony"));
    }
    ignored_issues(config)?;
    Ok(())
}

fn configured_environments(config: &Value) -> io::Result<()> {
    if let Some(envs) =
        aspect_value(config, "teambit.generator/generator").and_then(|gen_cfg| gen_cfg.get("envs"))
        && !envs
            .as_array()
            .is_some_and(|envs| envs.iter().all(Value::is_string))
    {
        return Err(invalid("status invalid configured environments"));
    }
    Ok(())
}

/// `IssuesMain.getIssuesToIgnoreGlobally`: the issue types `ignoreIssues` of
/// `teambit.component/issues` removes from every component. A name outside
/// `IssuesClasses` makes the Node.js CLI throw `NonExistIssueError`, so it declines.
pub(in crate::workspace::engine) fn ignored_issues(config: &Value) -> io::Result<Vec<String>> {
    let Some(names) = aspect_value(config, ISSUES).and_then(|issues| issues.get("ignoreIssues"))
    else {
        return Ok(Vec::new());
    };
    let names = names.as_array().ok_or_else(|| invalid("status ignoreIssues"))?;
    names
        .iter()
        .map(|name| match name.as_str() {
            Some(name) if ISSUE_CLASSES.contains(&name) => Ok(name.to_string()),
            _ => Err(invalid("status unknown ignored issue requires Harmony")),
        })
        .collect()
}

/// [`ignored_issues`] of the workspace at `root`.
pub(in crate::workspace::engine) fn ignored_issues_at(root: &Path) -> io::Result<Vec<String>> {
    ignored_issues(&document(&root.join("workspace.jsonc"))?)
}

pub(in crate::workspace::engine) fn document(path: &Path) -> io::Result<Value> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(invalid("status nonordinary configuration"));
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        return Err(invalid("status configuration budget"));
    }
    jsonc::parse(&bytes)
}
pub(in crate::workspace::engine) fn options(config: &Value, patterns: &[String]) -> Value {
    json!({"trackAllFiles":config["trackAllFiles"].as_bool().unwrap_or(false),
        "ignoredFiles":config.get("ignoredFiles").cloned().unwrap_or_else(|| json!([])),"patterns":patterns})
}

#[cfg(test)]
mod tests;

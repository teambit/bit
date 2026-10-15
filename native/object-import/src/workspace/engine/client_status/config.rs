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
const ISSUE_CLASSES: [&str; 25] = [
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
    "PinnedDependencies",
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
            !matches!(
                key.as_str(),
                "$schema"
                    | "teambit.workspace/workspace"
                    | "teambit.generator/generator"
                    | "teambit.dependencies/dependency-resolver"
                    | "teambit.workspace/workspace-config-files"
                    | PREVIEW
                    | ISSUES,
            )
        })
    {
        return Err(invalid("status configured extensions require Harmony"));
    }
    let workspace = workspace_settings(config)?;
    extensions(config)?;
    let scope = document(&root.join(".bit/scope.json"))?;
    if (!lane && scope["lanes"]["current"] != "main") || scope.get("license").is_some() {
        return Err(invalid("status non-main scope"));
    }
    if !fs::symlink_metadata(root.join(".bit/objects"))?.is_dir() {
        return Err(invalid("status object directory"));
    }
    Ok(workspace)
}

fn workspace_settings(config: &Value) -> io::Result<Value> {
    let workspace = config
        .get("teambit.workspace/workspace")
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
        .keys()
        .any(|key| {
            !matches!(
                key.as_str(),
                "name"
                    | "icon"
                    | "defaultDirectory"
                    | "defaultScope"
                    | "resolveAspectsFromNodeModules"
                    | "resolveEnvsFromRoots"
                    | "trackAllFiles"
                    | "ignoredFiles",
            )
        })
    {
        return Err(invalid("status unsupported workspace settings"));
    }
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
    for (name, allowed) in [
        ("teambit.generator/generator", &["envs"][..]),
        (
            "teambit.dependencies/dependency-resolver",
            &["policy", "allowScripts", "rootComponents", "linkCoreAspects"][..],
        ),
        ("teambit.workspace/workspace-config-files", &["enableWorkspaceConfigWrite"][..]),
        (PREVIEW, &["disabled"][..]),
        (ISSUES, &["ignoreIssues"][..]),
    ] {
        if let Some(value) = config.get(name) {
            let fields = value.as_object().ok_or_else(|| invalid("status aspect settings"))?;
            if fields
                .keys()
                .any(|key| !allowed.contains(&key.as_str()))
            {
                return Err(invalid("status aspect settings require Harmony"));
            }
        }
    }
    // `bit install <package>` writes the default, `true`; linking core aspects
    // differently is left to Harmony.
    if config["teambit.dependencies/dependency-resolver"]
        .get("linkCoreAspects")
        .is_some_and(|link| link != true)
    {
        return Err(invalid("status unlinked core aspects require Harmony"));
    }
    if let Some(envs) = config["teambit.generator/generator"].get("envs")
        && !envs.as_array().is_some_and(Vec::is_empty)
    {
        return Err(invalid("status configured environments require Harmony"));
    }
    // Only previews and builds read the preview settings.
    if config[PREVIEW]
        .get("disabled")
        .is_some_and(|disabled| !disabled.is_boolean())
    {
        return Err(invalid("status preview settings require Harmony"));
    }
    ignored_issues(config)?;
    Ok(())
}

/// `IssuesMain.getIssuesToIgnoreGlobally`: the issue types `ignoreIssues` of
/// `teambit.component/issues` removes from every component. A name outside
/// `IssuesClasses` makes the Node.js CLI throw `NonExistIssueError`, so it declines.
pub(in crate::workspace::engine) fn ignored_issues(config: &Value) -> io::Result<Vec<String>> {
    let Some(names) = config[ISSUES].get("ignoreIssues") else {
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

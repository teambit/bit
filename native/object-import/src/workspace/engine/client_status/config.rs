use super::{Target, invalid};
use crate::recovery::jsonc;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read},
    path::Path,
};

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
                    | "teambit.workspace/workspace-config-files",
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
    Ok(())
}

pub(super) fn targets(root: &Path, config: &Value) -> io::Result<Vec<Target>> {
    let bitmap = document(&root.join(".bitmap"))?;
    bitmap_targets(&bitmap, config)
}
fn bitmap_targets(bitmap: &Value, config: &Value) -> io::Result<Vec<Target>> {
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    let metadata_rows = 1 + usize::from(entries.contains_key("_bit_lane"));
    if bitmap["$schema-version"] != "17.0.0" || entries.len() > 4096 + metadata_rows {
        return Err(invalid("status bitmap schema or count"));
    }
    let mut roots = HashSet::new();
    let mut ids = HashSet::new();
    let mut targets = Vec::new();
    for (key, value) in entries {
        if key == "$schema-version" || key == "_bit_lane" {
            continue;
        }
        insert_target(key, value, config, &mut roots, &mut ids, &mut targets)?;
    }
    Ok(targets)
}
fn insert_target(
    key: &str,
    value: &Value,
    config: &Value,
    roots: &mut HashSet<String>,
    ids: &mut HashSet<String>,
    targets: &mut Vec<Target>,
) -> io::Result<()> {
    // Object.keys puts integer-like property names first; decline those
    // legacy aliases until the command uses the shared JS property ordering.
    if key.parse::<u32>().is_ok() {
        return Err(invalid("status numeric bitmap alias"));
    }
    let target = target(value, config)?;
    if !roots.insert(target.directory.clone()) || !ids.insert(target.id.clone()) {
        return Err(invalid("status duplicate component"));
    }
    targets.push(target);
    Ok(())
}
fn target(value: &Value, config: &Value) -> io::Result<Target> {
    let entry = value.as_object().ok_or_else(|| invalid("status bitmap entry"))?;
    if entry
        .keys()
        .any(|key| {
            !matches!(
                key.as_str(),
                "name" | "scope" | "version" | "defaultScope" | "mainFile" | "rootDir",
            )
        })
    {
        return Err(invalid("status component requires Harmony"));
    }
    let name = text(value, "name")?;
    let scope = text(value, "scope")?;
    let version = text(value, "version")?;
    let directory = text(value, "rootDir")?;
    let effective_scope = if scope.is_empty() {
        value
            .get("defaultScope")
            .unwrap_or_else(|| &config["defaultScope"])
            .as_str()
            .ok_or_else(|| invalid("status missing default scope"))?
    } else {
        scope
    };
    identifier(name, true)?;
    identifier(effective_scope, false)?;
    if !version.is_empty() && !version_supported(version) {
        return Err(invalid("status unsupported version syntax"));
    }
    if !scope.is_empty() && version.is_empty() {
        return Err(invalid("status unversioned scoped component"));
    }
    relative(directory, true)?;
    relative(text(value, "mainFile")?, false)?;
    Ok(Target {
        id: format!("{effective_scope}/{name}"),
        directory: directory.into(),
        version: version.into(),
    })
}
fn identifier(value: &str, slash: bool) -> io::Result<()> {
    if value.is_empty()
        || value.len() > 1024
        || value
            .split('/')
            .any(|part| {
                part.is_empty()
                    || matches!(part, "." | "..")
                    || !part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || matches!(byte, b'-' | b'_')
                                || (!slash && byte == b'.')
                        })
            })
        || (!slash && !scope_supported(value))
    {
        return Err(invalid("status component identity"));
    }
    Ok(())
}
fn scope_supported(value: &str) -> bool {
    value.len() >= 2
        && !value.contains('/')
        && !value.starts_with('.')
        && !value.ends_with('.')
        && value
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
}
fn version_supported(value: &str) -> bool {
    crate::merge_history::hash(value).is_ok()
        || (value.split('.').count() == 3
            && value
                .split('.')
                .all(|part| {
                    (part == "0" || !part.starts_with('0'))
                        && part.bytes().all(|byte| byte.is_ascii_digit())
                        && part
                            .parse::<u64>()
                            .is_ok_and(|number| number <= 9_007_199_254_740_991)
                }))
}
fn relative(value: &str, root: bool) -> io::Result<()> {
    if root && value == "." {
        return Ok(());
    }
    if value.is_empty()
        || !value.is_ascii()
        || value.len() > 32768
        || value
            .bytes()
            .any(|byte| {
                matches!(byte, 0 | b'\\' | b':' | b'*' | b'?' | b'[' | b']' | b'{' | b'}' | b'!')
            })
        || value
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("status component path"));
    }
    Ok(())
}
fn text<'a>(value: &'a Value, key: &str) -> io::Result<&'a str> {
    value[key].as_str().ok_or_else(|| invalid("status invalid component field"))
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

/// Preserve bitmap order while exposing only the fields the cold command owns.
pub(in crate::workspace::engine) fn context_targets(
    root: &Path,
    config: &Value,
) -> io::Result<Vec<Value>> {
    let bitmap = document(&root.join(".bitmap"))?;
    context_bitmap_targets(&bitmap, config)
}
pub(in crate::workspace::engine) fn context_bitmap_targets(
    bitmap: &Value,
    config: &Value,
) -> io::Result<Vec<Value>> {
    let targets = bitmap_targets(bitmap, config)?;
    let entries = bitmap.as_object().ok_or_else(|| invalid("status bitmap"))?;
    Ok(targets
        .into_iter()
        .zip(
            entries
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane")),
        )
        .map(|(target, (_, entry))| {
            json!({"identity":target.id,"directory":target.directory,
            "version":target.version,"mainFile":entry["mainFile"]})
        })
        .collect())
}

#[cfg(test)]
mod tests;

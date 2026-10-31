use super::{Options, error, rows, unsupported};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn choose(
    root: &Path,
    directory: &str,
    options: &Options,
    bitmap: &Value,
) -> io::Result<(String, bool, Option<String>)> {
    if let Some(id) = &options.id {
        return explicit(id, bitmap, options.scope.as_deref());
    }
    if let Some(rows) = bitmap.as_object()
        && let Some((key, row)) = rows
            .iter()
            .find(|(_, row)| row["rootDir"] == directory)
    {
        return Ok((
            rows::row_name(key, row).unwrap_or(key).into(),
            false,
            super::rows::scope(row).map(str::to_owned),
        ));
    }
    generated(root, directory, options)
}

fn generated(
    root: &Path,
    directory: &str,
    options: &Options,
) -> io::Result<(String, bool, Option<String>)> {
    let path = root.join(directory);
    let name = chunk(
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    );
    let namespace = options.namespace
        .clone()
        .unwrap_or_else(|| {
            chunk(
                path.parent()
                    .and_then(Path::file_name)
                    .and_then(|name| name.to_str())
                    .unwrap_or_default(),
            )
        });
    let identity = if namespace.is_empty() { name } else { format!("{namespace}/{name}") };
    validate(&identity)?;
    Ok((identity, options.namespace.is_none(), None))
}
fn explicit(
    id: &str,
    bitmap: &Value,
    scope: Option<&str>,
) -> io::Result<(String, bool, Option<String>)> {
    let trimmed = id.trim();
    let (name, version) = trimmed
        .rsplit_once('@')
        .map_or((trimmed, None), |(name, version)| (name.trim(), Some(version.trim())));
    let existing = rows::find(bitmap, name, scope)?;
    if let Some(version) = version
        && (existing.is_none_or(|row| row["version"].as_str().map(str::trim) != Some(version))
            || version.is_empty())
    {
        return Err(error(format!(
            "please remove the version part from the specified id {id} and try again",
        )));
    }
    let name = existing
        .and_then(|row| {
            row["name"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
        .unwrap_or(name);

    validate(name)?;
    Ok((name.into(), false, existing.and_then(rows::scope).map(str::to_owned)))
}

pub(super) fn scope(
    facts: &Value,
    directory: &str,
    name: &str,
    options: &Options,
) -> io::Result<String> {
    if let Some(scope) = options.scope
        .as_deref()
        .or_else(|| facts["defaultScopes"][directory].as_str())
        .filter(|scope| !scope.trim().is_empty())
    {
        return Ok(scope.into());
    }
    let variants = variant_scope(&facts["workspace"], directory, name)?;
    if variants.as_deref().is_none_or(str::is_empty) && vendor(&facts["workspace"], directory) {
        return Err(unsupported("tracking unscoped vendor component requires canonical loading"));
    }
    let scope = variants
        .as_deref()
        .or_else(|| workspace_aspect(&facts["workspace"])["defaultScope"].as_str())
        .or_else(|| facts["defaultScope"].as_str())
        .unwrap_or_default();
    if scope.is_empty() {
        return Err(error(
            "a default scope is missing. please set the defaultScope in workspace.jsonc",
        ));
    }
    Ok(scope.into())
}
pub(crate) fn workspace_aspect(workspace: &Value) -> &Value {
    workspace
        .as_object()
        .and_then(|rows| {
            rows.iter()
                .find(|(id, _)| id.split('@').next() == Some("teambit.workspace/workspace"))
                .map(|(_, val)| val)
        })
        .unwrap_or(&Value::Null)
}
pub(super) fn vendor(workspace: &Value, directory: &str) -> bool {
    let parent = workspace_aspect(workspace)["vendor"]["directory"]
        .as_str()
        .filter(|parent| !parent.is_empty())
        .unwrap_or("vendor");
    let parent = parent.trim_end_matches(std::path::MAIN_SEPARATOR);
    let directory = directory.trim_end_matches(std::path::MAIN_SEPARATOR);
    let (parent, directory) = if cfg!(windows) {
        (parent.to_lowercase(), directory.to_lowercase())
    } else {
        (parent.into(), directory.into())
    };
    directory == parent || directory.starts_with(&format!("{parent}/"))
}

fn variant_scope(workspace: &Value, directory: &str, name: &str) -> io::Result<Option<String>> {
    let config = workspace
        .as_object()
        .and_then(|rows| {
            rows.iter()
                .find(|(id, _)| id.split('@').next() == Some("teambit.workspace/variants"))
        })
        .map(|(_, value)| value);
    let variants = config
        .and_then(Value::as_object)
        .map(|rows| {
            rows.iter()
                .filter_map(|(pattern, value)| {
                    value
                        .as_object()
                        .map(|value| (pattern.clone(), value.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(bit_workspace_config::variants::by_root_dir_and_name(&variants, directory, name)?
        .default_scope)
}

pub(super) fn validate(name: &str) -> io::Result<()> {
    if name.is_empty()
        || name
            .split('/')
            .any(|part| {
                part.is_empty()
                    || !part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || b"-_".contains(&byte)
                        })
            })
    {
        return Err(error(format!(
            r#"error: "{name}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]"#,
        )));
    }
    Ok(())
}
fn chunk(name: &str) -> String {
    let text = name.replace('.', "").replace(' ', "-");
    let characters = text.chars().collect::<Vec<_>>();
    let mut output = String::new();
    for (index, character) in characters.iter().copied().enumerate() {
        if camel_boundary(&characters, index, character) {
            output.push('-');
        }
        output.extend(character.to_lowercase());
    }
    output
}

fn camel_boundary(characters: &[char], index: usize, character: char) -> bool {
    if !character.is_ascii_uppercase() || index == 0 {
        return false;
    }
    let previous = characters[index - 1];
    let next = characters.get(index + 1).copied();
    previous.is_ascii_lowercase()
        || previous.is_ascii_digit()
        || (previous.is_ascii_uppercase()
            && next.is_some_and(|next| next.is_ascii_lowercase() || next.is_ascii_digit()))
}

pub(super) fn id(name: &str, scope: &str, version: &str) -> String {
    if version.is_empty() { format!("{scope}/{name}") } else { format!("{scope}/{name}@{version}") }
}
pub(super) fn model(facts: &Value, name: &str, scope: &str) -> Option<Value> {
    facts["models"]
        .as_array()?
        .iter()
        .find(|model| model["name"] == name && model["scope"] == scope)
        .cloned()
}
pub(super) fn root_config(existing: Option<&Value>, options: &Options) -> Value {
    let mut config = existing
        .filter(|config| config.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(added) = options.config.as_object() {
        for (key, value) in added {
            config[key] = value.clone();
        }
    }
    if config
        .as_object()
        .and_then(|cfg| {
            cfg.get("teambit.envs/envs")
                .or_else(|| {
                    cfg.iter()
                        .find_map(|(key, val)| key.starts_with("teambit.envs/envs@").then_some(val))
                })
        })
        .is_some_and(bit_workspace_config::truthy)
    {
        return config;
    }
    config["teambit.harmony/empty-env"] = json!({});
    config["teambit.envs/envs"] = json!({"env":"teambit.harmony/empty-env"});
    config
}

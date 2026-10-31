use super::{Identity, Options, invalid, unsupported};
use serde_json::Value;
use std::{
    fs, io,
    path::{Component, Path},
};

pub(super) fn prepare(
    root: &Path,
    bitmap: &Value,
    workspace: &Value,
    options: &Options,
    preflight: bool,
) -> io::Result<Identity> {
    validate_name(&options.target)?;
    let (key, source) = selected(bitmap, &options.source)?;
    let source_name = row_name(key, source);
    let source_scope = resolve_source_scope(key, source, workspace)?;
    let target_scope = options.scope.as_deref().unwrap_or(source_scope);
    validate_scope(target_scope)?;
    if !preflight && source_name == options.target && source_scope == target_scope {
        return Err(invalid(format!(
            r#"source-id and target-id are equal: "{source_scope}/{source_name}""#,
        )));
    }
    let exported = source["scope"]
        .as_str()
        .is_some_and(|scope| !scope.is_empty());
    let source_version = extract_source_version(key, source);
    staged(source_version.as_deref(), source_scope, source_name, exported)?;
    let source_directory = source["rootDir"]
        .as_str()
        .filter(|dir| !dir.trim().is_empty())
        .ok_or_else(|| unsupported("rename component root"))?;
    let target_directory = directory(workspace, target_scope, options, source_directory, exported)?;
    if !preflight {
        destination(root, source_directory, &target_directory)?;
    }
    Ok(Identity {
        source: format!("{source_scope}/{source_name}"),
        target: format!("{target_scope}/{}", options.target),
        source_name: source_name.into(),
        source_version,
        target_name: options.target.clone(),
        source_directory: source_directory.into(),
        target_directory,
        exported,
    })
}
fn resolve_source_scope<'a>(
    key: &'a str,
    source: &'a Value,
    workspace: &'a Value,
) -> io::Result<&'a str> {
    let ws_default_scope =
        crate::component_tracking::identity::workspace_aspect(workspace)["defaultScope"]
            .as_str()
            .filter(|val| !val.is_empty());
    row_scope(key, source).or(ws_default_scope).ok_or_else(|| unsupported("rename source scope"))
}
fn extract_source_version(key: &str, source: &Value) -> Option<String> {
    source["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .or_else(|| key.rsplit_once('@').map(|(_, version)| version.trim()))
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
        .map(str::to_owned)
}
pub(super) fn selected<'a>(bitmap: &'a Value, id: &str) -> io::Result<(&'a str, &'a Value)> {
    select_row(bitmap, id, false)
}
pub(super) fn selected_any<'a>(bitmap: &'a Value, id: &str) -> io::Result<(&'a str, &'a Value)> {
    select_row(bitmap, id, true)
}
fn select_row<'a>(
    bitmap: &'a Value,
    id: &str,
    include_removed: bool,
) -> io::Result<(&'a str, &'a Value)> {
    let id = id
        .trim()
        .split('@')
        .next()
        .unwrap_or(id)
        .trim();
    let mut rows = bitmap
        .as_object()
        .ok_or_else(|| unsupported("rename bitmap"))?
        .iter()
        .filter(|(key, row)| {
            let key_id = key.rsplit_once('@').map_or(key.as_str(), |(bare, _)| bare);
            let row_name = row_name(key, row);
            row["rootDir"].is_string()
                && row["isAvailableOnCurrentLane"] != false
                && (include_removed
                    || !crate::workspace::engine::client_status::config::is_config_removed(
                        &row["config"],
                    ))
                && (key_id == id
                    || *key == id
                    || row_name == id
                    || row_scope(key, row).is_some_and(|scope| format!("{scope}/{row_name}") == id))
        });
    let (key, row) = rows
        .next()
        .ok_or_else(|| invalid(format!("component {id} was not found")))?;
    if rows.next().is_some() {
        return Err(invalid(format!("component {id} is ambiguous")));
    }
    Ok((key, row))
}
pub(crate) fn row_name<'a>(key: &'a str, row: &'a Value) -> &'a str {
    if let Some(name) = row["name"]
        .as_str()
        .filter(|name| !name.is_empty())
    {
        return name;
    }
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    if let Some(row_scope) = scope(row) {
        return key_id
            .strip_prefix(row_scope)
            .and_then(|rest| rest.strip_prefix('/'))
            .unwrap_or(key_id);
    }
    key_id.split_once('/').map_or(key_id, |(_, name)| name)
}
pub(crate) fn scope(row: &Value) -> Option<&str> {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
}
pub(crate) fn row_scope<'a>(key: &'a str, row: &'a Value) -> Option<&'a str> {
    scope(row)
        .or_else(|| {
            key.rsplit_once('@')
                .map_or(key, |(bare, _)| bare)
                .split_once('/')
                .map(|(sc, _)| sc)
                .filter(|sc| !sc.is_empty())
        })
}
fn staged(version: Option<&str>, scope: &str, name: &str, exported: bool) -> io::Result<()> {
    if !exported && let Some(version) = version {
        return Err(invalid(format!(
            "the following components are tagged/snapped but not exported:\n{scope}/{name}@{version}\nrenaming them will result in deprecating/deleting the current ones and creating new components, which is unnecessary.\nplease reset the components first (using \"bit reset\") and then re-run the rename command",
        )));
    }
    Ok(())
}
/// Validate a target component name against Bit's naming rules.
pub fn validate_name(name: &str) -> io::Result<()> {
    if !name.is_empty()
        && !name.contains("//")
        && name
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_$!/".contains(&byte)
            })
    {
        return Ok(());
    }
    if name.contains('.') {
        return Err(invalid(format!(
            "error: new-name argument \"{name}\" includes a dot.\nmake sure this argument is the name only, without the scope-name. to change the scope-name, use --scope flag",
        )));
    }
    Err(invalid(format!(
        r#"error: "{name}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]"#,
    )))
}
fn validate_scope(scope: &str) -> io::Result<()> {
    if scope.is_empty()
        || !scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_$!.".contains(&byte)
            })
    {
        return Err(invalid(format!("invalid scope name: {scope}")));
    }
    Ok(())
}
fn directory(
    workspace: &Value,
    scope: &str,
    options: &Options,
    source: &str,
    exported: bool,
) -> io::Result<String> {
    if options.preserve && !exported {
        return Ok(source.into());
    }
    let template =
        crate::component_tracking::identity::workspace_aspect(workspace)["defaultDirectory"]
            .as_str()
            .filter(|value| !value.is_empty())
            .unwrap_or("components/{name}");
    let template = if template.contains("{name}") {
        template.to_owned()
    } else {
        format!("{template}/{{name}}")
    };
    let (owner, name) = scope
        .rsplit_once('.')
        .unwrap_or(("", scope));
    let result = options.path
        .clone()
        .filter(|_| exported)
        .unwrap_or_else(|| {
            template
                .replace("{scopeId}", scope)
                .replace("{scope}", name)
                .replace("{owner}", owner)
                .replace("{name}", &options.target)
        });
    if Path::new(&result)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
        || result.contains(['{', '}', '\\'])
    {
        return Err(unsupported("rename target path"));
    }
    Ok(result)
}
fn destination(root: &Path, source: &str, target: &str) -> io::Result<()> {
    if source == "."
        || target == "."
        || source.starts_with(&format!("{target}/"))
        || target.starts_with(&format!("{source}/"))
    {
        return Err(unsupported("rename overlapping root"));
    }
    if source != target
        && let Ok(metadata) = fs::symlink_metadata(root.join(target))
    {
        if !metadata.is_dir() {
            return Err(invalid(format!(
                r#"unable to create component at "{target}", this path already exists"#,
            )));
        }
        if fs::read_dir(root.join(target))?.next().is_some() {
            return Err(invalid(format!(
                r#"unable to create component at "{target}", this directory is not empty"#,
            )));
        }
    }
    Ok(())
}

use super::{Options, invalid, unsupported};
use crate::component_tracking::observe::Observed;
use serde_json::Value;
use std::{
    fs, io,
    path::{Component, Path},
};

pub(super) struct Identity {
    pub target: String,
    pub key: String,
    pub name: String,
    pub scope: String,
    pub directory: String,
    pub main: String,
}
pub(super) fn prepare(
    root: &Path,
    options: &Options,
    source: &Value,
    bitmap: &Value,
    workspace: &Value,
    observed: &mut Observed,
) -> io::Result<Identity> {
    let (_, source_name) = source_id(options, source)?;
    let name = options.target.as_deref().unwrap_or(source_name);
    crate::component_rename::copy_refactor::validate_name(name)?;
    let scope = options.scope
        .as_deref()
        .or_else(|| {
            crate::component_tracking::identity::workspace_aspect(workspace)["defaultScope"].as_str(
            )
        })
        .ok_or_else(|| invalid("failed finding defaultScope"))?;
    scope_name(scope)?;
    let target = format!("{scope}/{name}");
    let directory = directory(
        options,
        name,
        scope,
        workspace,
        bitmap,
        source["incrementPathIfConflicted"] == true,
    )?;
    destination(root, &directory, observed)?;
    let ws_default =
        crate::component_tracking::identity::workspace_aspect(workspace)["defaultScope"]
            .as_str()
            .filter(|val| !val.is_empty());
    available(bitmap, name, scope, ws_default, &target)?;
    let main = source["mainFile"].as_str().ok_or_else(|| unsupported("fork main file"))?;
    let main = if options.remote && !options.preserve && source["refactorIdentity"] != false {
        crate::component_rename::copy_refactor::filename(main, leaf(source_name), leaf(name))?
    } else {
        main.into()
    };
    let duplicate_name = bitmap
        .as_object()
        .is_some_and(|rows| rows.iter().any(|(key, row)| is_active_named(key, row, name)));
    let key = if duplicate_name { target.clone() } else { name.into() };
    Ok(Identity { target, key, name: name.into(), scope: scope.into(), directory, main })
}
fn is_active_named(key: &str, row: &Value, name: &str) -> bool {
    row.is_object()
        && !key.starts_with('$')
        && key != "_bit_lane"
        && key != "version"
        && row["isAvailableOnCurrentLane"] != false
        && !crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        && crate::component_rename::copy_refactor::row_name(key, row) == name
}
fn available(
    bitmap: &Value,
    name: &str,
    scope: &str,
    ws_default: Option<&str>,
    target: &str,
) -> io::Result<()> {
    let found = bitmap
        .as_object()
        .is_some_and(|rows| {
            rows.iter().any(|(key, row)| row_matches_scope(key, row, name, scope, ws_default))
        });
    if found {
        return Err(invalid(format!("component {target} already exists")));
    }
    Ok(())
}
fn row_matches_scope(
    key: &str,
    row: &Value,
    name: &str,
    scope: &str,
    ws_default: Option<&str>,
) -> bool {
    let row_scope = crate::component_rename::copy_refactor::scope(row)
        .or_else(|| {
            key.rsplit_once('@')
                .map_or(key, |(bare, _)| bare)
                .split_once('/')
                .map(|(sc, _)| sc)
        })
        .or(ws_default);
    is_active_named(key, row, name) && row_scope == Some(scope)
}
pub(super) fn source_id<'a>(
    options: &'a Options,
    source: &'a Value,
) -> io::Result<(&'a str, &'a str)> {
    let id = source["identity"]
        .as_str()
        .unwrap_or(&options.source)
        .split('@')
        .next()
        .unwrap_or_default();
    id.split_once('/')
        .filter(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
        .ok_or_else(|| unsupported("fork requires scoped source identity"))
}
pub(super) fn leaf(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}
fn scope_name(scope: &str) -> io::Result<()> {
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
    options: &Options,
    name: &str,
    scope: &str,
    workspace: &Value,
    bitmap: &Value,
    increment: bool,
) -> io::Result<String> {
    let template =
        crate::component_tracking::identity::workspace_aspect(workspace)["defaultDirectory"]
            .as_str()
            .unwrap_or("components/{name}");
    let template =
        if template.contains("{name}") { template.into() } else { format!("{template}/{{name}}") };
    let (owner, short_scope) = scope
        .rsplit_once('.')
        .unwrap_or(("", scope));
    let mut path = options.path
        .clone()
        .unwrap_or_else(|| {
            template
                .replace("{name}", name)
                .replace("{scopeId}", scope)
                .replace("{scope}", short_scope)
                .replace("{owner}", owner)
        });
    if options.path.is_none() && increment {
        path = increment_path(&path, bitmap);
    }
    let parsed = Path::new(&path);
    if parsed.is_absolute()
        || parsed
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || path.is_empty()
    {
        return Err(unsupported("fork target path must be workspace relative"));
    }
    Ok(path.replace('\\', "/"))
}
fn increment_path(path: &str, bitmap: &Value) -> String {
    let paths = bitmap
        .as_object()
        .into_iter()
        .flat_map(|rows| rows.values())
        .filter_map(|row| row["rootDir"].as_str())
        .collect::<Vec<_>>();
    let parent = paths
        .iter()
        .copied()
        .find(|other| path.starts_with(*other));
    let conflicts = parent.is_some()
        || paths
            .iter()
            .any(|other| *other == path || other.starts_with(&format!("{path}/")));
    if !conflicts {
        return path.into();
    }
    let base = parent.unwrap_or(path);
    let mut index = 1;
    loop {
        let next = format!("{base}_{index}");
        if !paths.contains(&next.as_str()) {
            return next;
        }
        index += 1;
    }
}
pub(super) fn destination(root: &Path, directory: &str, observed: &mut Observed) -> io::Result<()> {
    let path = root.join(directory);
    let mut parent = path.parent().ok_or_else(|| unsupported("fork destination parent"))?;
    while !parent.exists() {
        parent = parent.parent().ok_or_else(|| unsupported("fork destination ancestor"))?;
    }
    observed.ancestors(root, parent)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            if fs::read_dir(&path)?
                .next()
                .transpose()?
                .is_some()
            {
                return Err(invalid(format!(
                    r#"unable to create component at "{directory}", this directory is not empty"#,
                )));
            }
        }
        Ok(_) => {
            return Err(invalid(format!(
                r#"unable to create component at "{directory}", this path already exists"#,
            )));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    Ok(())
}

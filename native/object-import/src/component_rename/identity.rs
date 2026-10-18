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
    let (_, source) = selected(bitmap, &options.source)?;
    let source_name = source["name"].as_str().ok_or_else(|| unsupported("rename bitmap name"))?;
    let source_scope = scope(source).ok_or_else(|| unsupported("rename source scope"))?;
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
    staged(source, source_scope, source_name, exported)?;
    let source_directory =
        source["rootDir"].as_str().ok_or_else(|| unsupported("rename component root"))?;
    let target_directory = directory(workspace, target_scope, options, source_directory, exported)?;
    if !preflight {
        destination(root, source_directory, &target_directory)?;
    }
    Ok(Identity {
        source: format!("{source_scope}/{source_name}"),
        target: format!("{target_scope}/{}", options.target),
        source_name: source_name.into(),
        source_version: source["version"]
            .as_str()
            .filter(|version| !version.is_empty())
            .map(str::to_owned),
        target_name: options.target.clone(),
        source_directory: source_directory.into(),
        target_directory,
        exported,
    })
}
pub(super) fn selected<'a>(bitmap: &'a Value, id: &str) -> io::Result<(&'a str, &'a Value)> {
    let id = id.split('@').next().unwrap_or(id);
    let mut rows = bitmap
        .as_object()
        .ok_or_else(|| unsupported("rename bitmap"))?
        .iter()
        .filter(|(key, row)| {
            row["rootDir"].is_string()
                && (*key == id
                    || row["name"] == id
                    || scope(row)
                        .is_some_and(|scope| {
                            format!("{scope}/{}", row["name"].as_str().unwrap_or(key)) == id
                        }))
        });
    let (key, row) = rows
        .next()
        .ok_or_else(|| invalid(format!("component {id} was not found")))?;
    if rows.next().is_some() {
        return Err(invalid(format!("component {id} is ambiguous")));
    }
    Ok((key, row))
}
pub(super) fn scope(row: &Value) -> Option<&str> {
    row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())
}
fn staged(row: &Value, scope: &str, name: &str, exported: bool) -> io::Result<()> {
    if !exported
        && let Some(version) = row["version"]
            .as_str()
            .filter(|version| !version.is_empty())
    {
        return Err(invalid(format!(
            "the following components are tagged/snapped but not exported:\n{scope}/{name}@{version}\nrenaming them will result in deprecating/deleting the current ones and creating new components, which is unnecessary.\nplease reset the components first (using \"bit reset\") and then re-run the rename command",
        )));
    }
    Ok(())
}
pub(super) fn validate_name(name: &str) -> io::Result<()> {
    if !name.is_empty()
        && !name.contains("//")
        && name
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_/".contains(&byte)
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
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_.".contains(&byte)
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
    let template = workspace["teambit.workspace/workspace"]["defaultDirectory"]
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

//! `Scope.ensureScopeJson` and the directories `Scope.ensureDir` owns.
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn document(
    path: &Path,
    name: &str,
    group: Option<&str>,
    version: &str,
    fresh: bool,
) -> io::Result<Vec<u8>> {
    let current = current(path, fresh)?;
    if !current.is_null() && !current.is_object() {
        return Err(io::Error::other("init scope metadata object"));
    }
    let mut scope = json!({"name":valid_name(name)?,"remotes":{}});
    if current.is_object() {
        copy_current(&mut scope, &current);
    } else {
        if let Some(group) = group.filter(|group| !group.is_empty()) {
            scope["groupName"] = json!(group);
        }
        scope["version"] = json!(version);
        scope["lanes"] = json!({"current":"main","tracking":[],"new":[]});
    }
    bit_workspace_config::render_scope_json(&scope)
}

fn current(path: &Path, fresh: bool) -> io::Result<Value> {
    if fresh || !path.join("objects").is_dir() {
        return Ok(Value::Null);
    }
    match fs::read(path.join("scope.json")) {
        Ok(bytes) => Ok(bit_object_import::parse_jsonc(&bytes)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

pub(super) fn valid_name(name: &str) -> io::Result<String> {
    let mut dot = false;
    let name = name
        .to_lowercase()
        .chars()
        .filter(|character| {
            if *character == '.' {
                if dot {
                    return false;
                }
                dot = true;
                return true;
            }
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || "$-_!".contains(*character)
        })
        .collect::<String>();
    if name.is_empty() {
        return Err(io::Error::other(
            "scope name created by directory name have to contains at least one character or number",
        ));
    }
    Ok(name)
}

pub(super) fn local_name(cwd: &Path) -> io::Result<String> {
    let mut random = [0u8; 4];
    getrandom::fill(&mut random).map_err(|error| io::Error::other(error.to_string()))?;
    let suffix = u32::from_be_bytes(random);
    Ok(format!(
        "{}-local-{suffix:08x}",
        cwd.file_name()
            .unwrap_or_default()
            .to_string_lossy(),
    ))
}

fn copy_current(scope: &mut Value, current: &Value) {
    for key in
        ["name", "remotes", "resolverPath", "license", "groupName", "version", "lanes", "config"]
    {
        if let Some(value) = current
            .get(key)
            .filter(|value| !value.is_null())
        {
            scope[key] = value.clone();
        }
    }
}

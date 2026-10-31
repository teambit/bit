use super::Compiled;
use bit_workspace_config::{config_string, effective, global_config_dir, read_global_config};
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::Path};

pub(super) fn batch_size(root: &Path) -> io::Result<usize> {
    let global = read_global_config(&global_config_dir())?;
    let scope = read(&bit_object_import::scope_path(root).join("scope.json"))?;
    let workspace = read(&root.join("workspace.jsonc"))?;
    let ws_store =
        crate::commands::update_cmd::aspect_entry(&workspace, "teambit.harmony/config-store")
            .map_or(&Value::Null, |(_, val)| val);
    let values = effective(&global, &scope["config"], ws_store, &["concurrency.io"]);
    let value = values
        .get("concurrency.io")
        .and_then(config_string)
        .unwrap_or_default();
    parse_concurrency_limit(&value)
}

fn parse_concurrency_limit(value: &str) -> io::Result<usize> {
    let trimmed = value.trim();
    let number = if trimmed.is_empty() {
        100
    } else {
        trimmed
            .parse::<usize>()
            .map_err(|_| io::Error::other("compiler I/O concurrency configuration"))?
    };
    let number = if number == 0 { 100 } else { number };
    if number > 256 {
        return Err(io::Error::other("compiler I/O concurrency limit"));
    }
    Ok(number)
}
fn read(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
pub(super) fn outputs(compiled: &[Compiled]) -> io::Result<()> {
    for row in compiled {
        if row.identity.trim().is_empty() {
            return Err(io::Error::other("compiler empty component identity"));
        }
        let mut paths = HashSet::new();
        for file in &row.files {
            if file.path.as_os_str().is_empty() || !paths.insert(&file.path) {
                return Err(io::Error::other("compiler colliding outputs"));
            }
        }
    }
    Ok(())
}

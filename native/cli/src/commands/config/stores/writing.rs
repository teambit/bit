//! Store persistence follows `GlobalConfig`, `ScopeJson` and `WorkspaceConfig` independently.
use super::{Document, Map, Store, Value, aspect};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(super) fn write(store: &Store) -> io::Result<()> {
    if store.origin == "workspace" {
        return workspace(store);
    }
    let value =
        if store.origin == "scope" { scope(store)? } else { Value::Object(store.values.clone()) };
    let value = bit_workspace_config::jsonc::Node::from_value(&value).to_value();
    let bytes = if store.origin == "scope" {
        bit_workspace_config::render_scope_json(&value)?
    } else {
        serde_json::to_vec_pretty(&value)?
    };
    if let Some(parent) = store.path.parent() {
        fs::create_dir_all(parent)?;
    }
    if store.origin == "global" {
        global(&store.path, &bytes)
    } else {
        fs::write(&store.path, bytes)
    }
}

fn scope(store: &Store) -> io::Result<Value> {
    let mut source = store.source
        .as_object()
        .cloned()
        .ok_or_else(|| io::Error::other("invalid scope config"))?;
    source.insert("config".to_owned(), Value::Object(store.values.clone()));
    let mut result = Map::new();
    for key in
        ["name", "remotes", "resolverPath", "license", "groupName", "version", "lanes", "config"]
    {
        if let Some(value) = source
            .shift_remove(key)
            .filter(|value| !value.is_null())
        {
            result.insert(key.to_owned(), value);
        }
    }
    for (key, value) in source {
        if !value.is_null() {
            result.insert(key, value);
        }
    }
    Ok(Value::Object(result))
}

fn workspace(store: &Store) -> io::Result<()> {
    let root = store.root.as_deref().ok_or_else(|| io::Error::other("workspace config root"))?;
    let identity = aspect(&store.source).to_owned();
    let Some((key, value)) = &store.change else { return Ok(()) };
    let mut document = Document::parse(&fs::read_to_string(&store.path)?)?;
    if let Some(value) = value {
        document.set(&[&identity, key], value);
    } else {
        document.remove(&[&identity, key]);
        if document.get(&[&identity]).is_none() {
            document.set(&[&identity], &Value::Object(Map::new()));
        }
    }
    bit_install::command::edit_workspace_config(
        root,
        &bit_workspace_config::scope_path(root),
        &crate::commands::workspace_command::file_id(),
        "store-config changes",
        |current| *current = document,
    )?;

    Ok(())
}

fn global(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options
        .create(true)
        .truncate(true)
        .write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(bytes)?;
    private(path)
}

#[cfg(unix)]
fn private(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}
#[cfg(not(unix))]
fn private(_path: &Path) -> io::Result<()> {
    Ok(())
}

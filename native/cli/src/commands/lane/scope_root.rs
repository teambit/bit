//! A lane inspection can start in a workspace or directly in a bare scope.
use crate::workspace;
use serde_json::Value;
use std::{
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

pub(crate) struct ScopeRoot {
    pub(crate) path: PathBuf,
    pub(crate) bare: bool,
}

pub(crate) fn discover() -> io::Result<Option<ScopeRoot>> {
    let cwd = env::current_dir()?;
    if let Some(path) = workspace::root(&cwd) {
        return read(&path, false).map(Some);
    }
    for path in cwd.ancestors() {
        if path.join("scope.json").is_file() {
            return read(path, true).map(Some);
        }
    }
    Ok(None)
}

fn read(path: &Path, bare: bool) -> io::Result<ScopeRoot> {
    let directory = if bare { path.to_owned() } else { bit_object_import::scope_path(path) };
    if !directory.join("objects").is_dir() {
        return Err(io::Error::other("lane scope objects directory absent"));
    }
    let bytes = fs::read(directory.join("scope.json"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(io::Error::other("lane scope configuration limit"));
    }
    let scope: Value = serde_json::from_slice(&bytes)?;
    scope["name"]
        .as_str()
        .filter(|value| !value.is_empty() && !value.contains('/'))
        .ok_or_else(|| io::Error::other("lane scope name"))?;
    if bare {
        validate_bare_index(&directory)?;
    }
    Ok(ScopeRoot { path: path.to_owned(), bare })
}

fn validate_bare_index(directory: &Path) -> io::Result<()> {
    let path = directory.join("index.json");
    if !path.is_file() {
        return Ok(());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(io::Error::other("lane scope index limit"));
    }
    let index: Value = serde_json::from_slice(&bytes)?;
    if !index["components"].is_array() || !index["lanes"].is_array() {
        return Err(io::Error::other("lane scope index"));
    }
    Ok(())
}

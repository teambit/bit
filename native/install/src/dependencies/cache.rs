//! Bit's dependency cache (`<scope>/cache/components/deps`), used when no file of
//! the component changed since it was written (`getDependenciesDataFromCacheIfPossible`).

use super::data::Detected;
use crate::{model::WorkspaceComponent, policy::scope::Scope};
use serde_json::Value;
use std::{io, path::PathBuf};

/// The cached detection of `component`, when fresh.
pub fn read(
    scope: &Scope,
    component: &WorkspaceComponent,
    pool: &rayon::ThreadPool,
) -> io::Result<Option<Detected>> {
    let Some(entry) =
        bit_object_import::read_dependency_cache(&scope.dependency_cache(), &key(component))?
    else {
        return Ok(None);
    };
    let Some(timestamp) = entry["timestamp"].as_f64() else { return Ok(None) };
    let mut files: Vec<PathBuf> = component.files
        .iter()
        .map(|file| component.dir.join(file))
        .collect();
    files.push(component.dir.join("component.json"));
    if bit_object_import::dependency_cache_stale(&component.dir, &files, timestamp, pool)? {
        return Ok(None);
    }
    let data: Value = match entry["data"].as_str() {
        Some(text) => serde_json::from_str(text).map_err(io::Error::other)?,
        None => return Ok(None),
    };
    Ok(Some(Detected::from_cache(&data)))
}

/// `ComponentID.toString()`: `scope/name@version`, the version omitted for new components.
fn key(component: &WorkspaceComponent) -> String {
    let id = component.id.to_string_without_version();
    match component.id.version
        .as_deref()
        .filter(|version| !version.is_empty() && *version != "latest")
    {
        Some(version) => format!("{id}@{version}"),
        None => id,
    }
}

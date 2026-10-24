use super::{
    super::{invalid, path, resolve_dependencies::normalize},
    MAX_FILES, PathMap, Request,
};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn validate(request: &Request) -> io::Result<()> {
    path(&request.root)?;
    if request.files.len() > MAX_FILES
        || request.visited
            .as_ref()
            .is_some_and(|visited| visited.len() > MAX_FILES)
        || request.detector.custom
            .as_ref()
            .is_some_and(|custom| custom.len() > MAX_FILES)
        || request.builtins.len() > 1024
        || request.detector_extensions.len() > 128
        || normalize(&request.root) != request.root
    {
        return Err(invalid("dependency graph request limit"));
    }
    if let Some(home) = &request.home {
        path(home)?;
    }
    for file in &request.files {
        path(file)?;
        if normalize(file) != *file {
            return Err(invalid("dependency graph normalized path"));
        }
    }
    custom(request)?;
    for (file, cached) in request.visited.iter().flat_map(|visited| visited.iter()) {
        cached_row(file, cached)?;
    }
    Ok(())
}

fn custom(request: &Request) -> io::Result<()> {
    for (file, custom) in request.detector.custom.iter().flat_map(|custom| custom.iter()) {
        path(Path::new(file))?;
        if !request.files.contains(&Path::new(file).to_owned())
            || custom.dependencies.len() > MAX_FILES
        {
            return Err(invalid("custom detector boundary"));
        }
        for resolved in custom.lookups.values().flatten() {
            path(resolved)?;
        }
    }
    Ok(())
}

fn cached_row(file: &str, cached: &Value) -> io::Result<()> {
    path(Path::new(file))?;
    if cached
        .get("error")
        .is_some_and(|error| !error.is_null())
    {
        return Err(invalid("dependency graph cached error"));
    }
    let row: PathMap = serde_json::from_value(cached["pathMap"].clone()).map_err(io::Error::other)?;
    if row.file != *file || row.dependencies.len() > MAX_FILES {
        return Err(invalid("dependency graph cached path map"));
    }
    for dependency in row.dependencies {
        path(Path::new(&dependency.resolved_dep))?;
    }
    if let Some(missing) = cached.get("missing") {
        let _: Vec<String> = serde_json::from_value(missing.clone()).map_err(io::Error::other)?;
    }
    if let Some(missing) = cached.get("missingPackages") {
        let _: Vec<String> = serde_json::from_value(missing.clone()).map_err(io::Error::other)?;
    }
    Ok(())
}

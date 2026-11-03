//! Parallel `node_modules` package resolution via [`read`] and [`metadata`] for [`Request`].

mod metadata;

use super::invalid;
use crate::workspace::engine::{
    path,
    resolve_dependencies::{Budget, normalize},
    source_overlay::SourceOverlay,
};
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::{
    io,
    path::{Path, PathBuf},
    sync::OnceLock,
};

/// Wire request for resolving installed `node_modules` package metadata across `names` via [`read`] and [`read_overlay`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    root: PathBuf,
    component_root: PathBuf,
    names: Vec<String>,
}
/// Resolves installed `node_modules` package metadata for `request` ([`Request`]) directly from disk via [`read_view`].
#[inline]
pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    read_view(request, pool, None)
}
/// Resolves installed `node_modules` package metadata for `request` against an in-memory [`SourceOverlay`].
#[inline]
pub(in crate::workspace::engine) fn read_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: &SourceOverlay,
) -> io::Result<(usize, Value)> {
    read_view(request, pool, Some(overlay))
}
/// Resolves installed `node_modules` package metadata for `request` ([`Request`]) using an optional [`SourceOverlay`].
fn read_view(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: Option<&SourceOverlay>,
) -> io::Result<(usize, Value)> {
    validate(request)?;
    let budget = match overlay {
        Some(view) => Budget::overlay(view)?,
        None => Budget::new(),
    };
    let dependent = OnceLock::new();
    let rows = pool.install(|| {
        request.names
            .par_iter()
            .map(|name| resolve(request, name, &budget, &dependent))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let resolved: Map<_, _> = rows.into_iter().flatten().collect();
    let mut output = json!({"resolved":resolved});
    if overlay.is_some() {
        output["readSet"] = serde_json::to_value(budget.proofs()?).map_err(io::Error::other)?;
    }
    Ok((resolved.len(), output))
}
/// Locates and resolves a single package `name` under `budget` ([`Budget`]) using [`metadata::resolved`].
fn resolve(
    request: &Request,
    name: &str,
    budget: &Budget,
    dependent: &OnceLock<io::Result<Option<Value>>>,
) -> io::Result<Option<(String, Value)>> {
    let Some(directory) = locate(request, name, budget)? else {
        return Ok(None);
    };
    let dependent = dependent
        .get_or_init(|| dependent_manifest(&request.component_root, &request.root, budget))
        .as_ref()
        .map_err(|error| io::Error::new(error.kind(), error.to_string()))?;
    let package = budget.package(&directory.join("package.json"))?;
    metadata::resolved(name, package.as_ref(), dependent.as_ref())
        .map(|row| row.map(|value| (name.to_owned(), value)))
}

fn validate(request: &Request) -> io::Result<()> {
    path(&request.root)?;
    path(&request.component_root)?;
    if request.names.len() > 4096
        || normalize(&request.root) != request.root
        || normalize(&request.component_root) != request.component_root
        || !request.component_root.starts_with(&request.root)
        || request.names
            .iter()
            .any(|name| !package_name(name))
    {
        return Err(invalid("dependency policy package path"));
    }
    Ok(())
}
fn package_name(name: &str) -> bool {
    if name.trim() != name
        || name.len() > 256
        || name.contains("node_modules")
        || !super::wire::name(name)
    {
        return false;
    }
    let scoped = name.strip_prefix('@');
    if name
        .bytes()
        .filter(|byte| *byte == b'/')
        .count()
        != usize::from(scoped.is_some())
    {
        return false;
    }
    scoped
        .unwrap_or(name)
        .split('/')
        .all(package_part)
}
#[inline]
fn package_part(part: &str) -> bool {
    !part.is_empty()
        && !matches!(part, "." | "..")
        && part
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

#[inline]
fn dependent_manifest(directory: &Path, root: &Path, budget: &Budget) -> io::Result<Option<Value>> {
    for ancestor in directory.ancestors() {
        if let Some(value) = budget.package(&ancestor.join("package.json"))? {
            return Ok(Some(value));
        }
        if ancestor == root {
            break;
        }
    }
    Ok(None)
}
#[inline]
fn locate(request: &Request, name: &str, budget: &Budget) -> io::Result<Option<PathBuf>> {
    for ancestor in request.component_root.ancestors() {
        let candidate = ancestor.join("node_modules").join(name);
        if budget
            .metadata(&candidate)?
            .is_some_and(|meta| !meta.is_file())
        {
            return Ok(Some(candidate));
        }
        if ancestor == request.root {
            break;
        }
    }
    Ok(None)
}

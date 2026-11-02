//! Resolve explicit test files without running component loaders or user tests.
//!
//! [`select`] matches [`Bitmap`] and [`Component`] paths via [`glob`] and [`paths`] into [`Selected`].
use super::{invalid, paths};
use crate::commands::workspace_command::component_service::Component;
use bit_install::{dependencies::glob, workspace::Bitmap};
use std::{
    env, io,
    path::{Path, PathBuf},
};

/// Explicit test file paths ([`PathBuf`]) and their owning component identities resolved from CLI patterns.
pub(super) struct Selected {
    pub identities: Vec<String>,
    pub paths: Vec<PathBuf>,
}

/// Resolves explicit test file arguments in `values` against `.bitmap` component directories in `root`.
pub(super) fn select(root: &Path, values: &[String]) -> io::Result<Option<Selected>> {
    if !any_existing_file(values) {
        return Ok(None);
    }
    if !all_existing_files(values) {
        return Err(invalid("tester mixed file selection"));
    }
    let cwd = env::current_dir()?;
    let mut paths = Vec::with_capacity(values.len());
    for value in values {
        let normalized = paths::normalized(&cwd.join(value.trim()));
        if !paths.contains(&normalized) {
            paths.push(normalized);
        }
    }
    let default_scope = bit_install::config::WorkspaceConfig::load(root)
        .ok()
        .and_then(|cfg| cfg.workspace.default_scope)
        .map(|scope| scope.trim().to_owned())
        .filter(|scope| !scope.is_empty());
    let bitmap = Bitmap::load(root, default_scope.as_deref())?;
    let mut identities = Vec::with_capacity(paths.len());
    for path in &paths {
        let identity = owner(root, &bitmap, path)?;
        if !identities.contains(&identity) {
            identities.push(identity);
        }
    }
    Ok(Some(Selected { identities, paths }))
}
/// Resolves the unique `.bitmap` component identity whose `rootDir` owns `path`.
fn owner(root: &Path, bitmap: &Bitmap, path: &Path) -> io::Result<String> {
    let mut owners = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.owns_its_dir()
                && path.starts_with(paths::normalized(&root.join(entry.root_dir.trim())))
        });
    let identity = owners
        .next()
        .ok_or_else(|| invalid("tester file owner"))?
        .id
        .to_string_without_version();
    if owners.next().is_some() {
        return Err(invalid("tester overlapping component file owners"));
    }
    Ok(identity)
}

/// Collects normalized absolute paths of files in `component` that match `patterns`.
pub(super) fn tests(component: &Component, patterns: &[String]) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::with_capacity(component.files.len());
    for file in &component.files {
        let relative = file["filePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("tester relative file"))?;
        if glob::match_patterns(relative, patterns) {
            let absolute = file["absolutePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| invalid("tester absolute file"))?;
            paths.push(paths::normalized(Path::new(absolute)));
        }
    }
    Ok(paths)
}

/// Returns `true` when at least one path in `values` resolves to an existing regular file.
#[inline]
fn any_existing_file(values: &[String]) -> bool {
    values
        .iter()
        .any(|value| Path::new(value.trim()).is_file())
}

/// Returns `true` when every path in `values` resolves to an existing regular file.
#[inline]
fn all_existing_files(values: &[String]) -> bool {
    values
        .iter()
        .all(|value| Path::new(value.trim()).is_file())
}

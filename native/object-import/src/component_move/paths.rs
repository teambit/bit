//! Workspace path normalization ([`locations`]), symlink guards, and tree observation for component moves.

use super::{Observed, invalid, unsupported};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
/// Validates and normalizes `from` and `to` move paths within the workspace `root`.
pub(super) fn locations(
    root: &Path,
    cwd: &Path,
    from: &str,
    to: &str,
) -> io::Result<(PathBuf, PathBuf, bool)> {
    let (from_trimmed, to_trimmed) = (from.trim(), to.trim());
    if from_trimmed.is_empty() || to_trimmed.is_empty() {
        return Err(invalid("move source and destination paths must not be empty"));
    }
    let source = normalize(&cwd.join(from_trimmed));
    let destination = normalize(&cwd.join(to_trimmed));
    if fs::symlink_metadata(&source).is_ok_and(|meta| meta.file_type().is_symlink())
        || fs::symlink_metadata(&destination).is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err(unsupported("move source symlinks"));
    }
    let first = source.try_exists()?;
    let second = destination.try_exists()?;
    validate_existing(&source, &destination, from, to, first, second)?;
    if !source.starts_with(root)
        || !destination.starts_with(root)
        || source == root
        || destination == root
    {
        return Err(unsupported("move outside component workspace paths"));
    }
    if destination.starts_with(&source) {
        return Err(invalid(format!(
            "unable to move '{}' into itself '{}'",
            source.display(),
            destination.display(),
        )));
    }
    Ok((source, destination, first))
}
/// Verify that exactly one of `source` or `destination` exists as a directory.
fn validate_existing(
    source: &Path,
    destination: &Path,
    from: &str,
    to: &str,
    first: bool,
    second: bool,
) -> io::Result<()> {
    if first && second {
        return Err(invalid(format!(
            "unable to move because both paths from ({from}) and to ({to}) already exist",
        )));
    }
    if !first && !second {
        return Err(invalid(format!("both paths from ({from}) and to ({to}) do not exist")));
    }
    if first && !source.is_dir() {
        return Err(invalid(
            "bit move supports moving directories only, not files.\nfiles within a component dir are automatically tracked, no action is needed.\nto change the main-file, use \"bit add <component-dir> --main <new-main-file>\"",
        ));
    }
    if second && !destination.is_dir() {
        return Err(invalid(format!(
            "unable to move because the destination path ({to}) is a file and not a directory",
        )));
    }
    Ok(())
}
/// Strip `root` from `path` and return a forward-slash relative path without leading/trailing slashes.
#[inline]
pub(super) fn relative(root: &Path, path: &Path) -> io::Result<String> {
    let stripped = path
        .strip_prefix(root)
        .map_err(|_| unsupported("move outside workspace"))?
        .to_string_lossy();
    let normalized = if stripped.contains('\\') {
        std::borrow::Cow::Owned(stripped.replace('\\', "/"))
    } else {
        stripped
    };
    Ok(normalized.trim_matches('/').to_owned())
}
pub(super) fn observe_tree(root: &Path, path: &Path, observed: &mut Observed) -> io::Result<()> {
    observed.ancestors(root, path)?;
    let mut pending = vec![path.to_owned()];
    while let Some(directory) = pending.pop() {
        for name in observed.directory(&directory)? {
            let child = directory.join(name);
            let metadata = fs::symlink_metadata(&child)?;
            if metadata.file_type().is_symlink() {
                return Err(unsupported("move source symlinks"));
            }
            if metadata.is_dir() {
                pending.push(child);
            } else {
                observed.read(&child)?;
            }
        }
    }
    Ok(())
}
pub(super) fn observe_parents(
    root: &Path,
    source: &Path,
    destination: &Path,
    observed: &mut Observed,
) -> io::Result<()> {
    for path in [source, destination] {
        let parent = path
            .ancestors()
            .find(|ancestor| ancestor.exists())
            .ok_or_else(|| unsupported("move parent"))?;
        observed.ancestors(root, parent)?;
        observed.directory(parent)?;
    }
    Ok(())
}
#[inline]
fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for part in path.components() {
        if part == std::path::Component::ParentDir {
            result.pop();
        } else if part != std::path::Component::CurDir {
            result.push(part.as_os_str());
        }
    }
    result
}

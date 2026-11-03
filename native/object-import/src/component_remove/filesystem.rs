//! Shared guarded workspace path validation ([`package`]) and best-effort `.bitmap` backup mechanics.
use super::invalid;
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};
/// Resolves and validates the `node_modules/@<owner>/<pkg>` symlink/package [`PathBuf`] under [`Path`] `root` for a component.
pub(super) fn package(root: &Path, scope: &str, name: &str) -> io::Result<PathBuf> {
    let (scope, name) = (scope.trim(), name.trim());
    if !super::valid_scope(scope) || !super::valid_name(name) {
        return Err(invalid("component package path"));
    }
    let (owner, rest) = scope
        .split_once('.')
        .map_or((scope, ""), |(owner, rest)| (owner.trim(), rest.trim()));
    if owner.is_empty() || (scope.contains('.') && rest.is_empty()) || name.is_empty() {
        return Err(invalid("component package path"));
    }
    let dotted_name = name.replace('/', ".");
    let filename = if rest.is_empty() { dotted_name } else { format!("{rest}.{dotted_name}") };
    let node_modules = root.join("node_modules");
    let package = node_modules
        .join(format!("@{owner}"))
        .join(filename);
    if !package.starts_with(&node_modules) {
        return Err(invalid("component package path"));
    }
    validate_ancestors(
        root,
        package.strip_prefix(root).map_err(|_| invalid("component package path"))?,
    )?;
    Ok(package)
}

/// Verify that all existing ancestor segments of `relative` under `root` are real directories.
pub(crate) fn validate_ancestors(root: &Path, relative: &Path) -> io::Result<()> {
    let mut path = root.to_owned();
    for part in relative.components() {
        if !matches!(part, Component::Normal(_)) {
            return Err(invalid("component path is outside the workspace"));
        }
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {
            }
            Ok(_) => return Err(invalid("component path is not a directory")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// Return `true` when `path` is non-empty and consists solely of [`Component::Normal`] path components.
#[inline]
pub(super) fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

/// Verify that `path`, if it exists on disk, is a regular directory and not a symlink.
#[inline]
pub(crate) fn validate_directory(path: &Path) -> io::Result<()> {
    let kind = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata.file_type(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if !kind.is_dir() || kind.is_symlink() {
        return Err(invalid("component path is not a directory"));
    }
    Ok(())
}

/// Recursively remove `path` if it exists, ignoring `ErrorKind::NotFound`.
#[inline]
pub(crate) fn remove_path(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Validate that `value` is a 6-part hyphen-separated numeric `.bitmap` history receipt ID (`<= 32` bytes).
#[inline]
pub(crate) fn validate_file_id(value: &str) -> io::Result<()> {
    let value = value.trim();
    let mut count = 0usize;
    let valid_parts = value
        .split('-')
        .all(|part| {
            count += 1;
            !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())
        });
    if value.len() > 32 || !valid_parts || count != 6 {
        return Err(invalid("component bitmap history receipt"));
    }
    Ok(())
}

pub(crate) fn backup_bitmap(root: &Path, file_id: &str, operation: &str) -> io::Result<()> {
    use std::io::Write;
    validate_file_id(file_id)?;
    let (file_id, operation) = (file_id.trim(), operation.trim());
    if operation.is_empty() {
        return Err(invalid("component bitmap history operation"));
    }
    let scope = crate::scope_path(root);
    let directory = scope.join("bitmap-history");
    fs::create_dir_all(&directory)?;
    fs::copy(root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(scope.join("bitmap-history-metadata.txt"))?;
    writeln!(metadata, "{file_id} {operation}")
}

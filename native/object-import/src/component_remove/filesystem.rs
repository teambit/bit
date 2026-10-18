//! Shared guarded workspace paths and best-effort bitmap backup mechanics.
use super::invalid;
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};
pub(super) fn package(root: &Path, scope: &str, name: &str) -> io::Result<PathBuf> {
    let (owner, rest) = scope
        .split_once('.')
        .map_or((scope, ""), |(owner, rest)| (owner, rest));
    let filename = if rest.is_empty() {
        name.replace('/', ".")
    } else {
        format!("{}.{}", rest, name.replace('/', "."))
    };
    let package = root
        .join("node_modules")
        .join(format!("@{owner}"))
        .join(filename);
    if !package.starts_with(root.join("node_modules")) {
        return Err(invalid("component package path"));
    }
    validate_ancestors(
        root,
        package.strip_prefix(root).map_err(|_| invalid("component package path"))?,
    )?;
    Ok(package)
}

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

pub(super) fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

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

pub(crate) fn remove_path(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub(crate) fn validate_file_id(value: &str) -> io::Result<()> {
    if value.len() > 32
        || value.split('-').count() != 6
        || value
            .split('-')
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(invalid("component bitmap history receipt"));
    }
    Ok(())
}

pub(crate) fn backup_bitmap(root: &Path, file_id: &str, operation: &str) -> io::Result<()> {
    use std::io::Write;
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

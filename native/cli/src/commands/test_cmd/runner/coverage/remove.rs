//! Keep the failing operation and path when deleting consumed coverage artifacts.
//!
//! [`directory`] removes coverage directories at [`Path`] locations via [`remove_directory_entries`] and [`ignore_not_found`], formatting errors via [`failure`].
use crate::commands::workspace_command::filesystem_error::failure;
use std::{fs, io, path::Path};

/// Recursively removes a coverage artifact `path`, preserving the failing syscall and path via [`failure`].
pub(super) fn directory(path: &Path) -> io::Result<()> {
    if path
        .to_str()
        .is_some_and(|text| text.trim().is_empty())
    {
        return Ok(());
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(failure(error, "lstat", path)),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return ignore_not_found(fs::remove_file(path), "unlink", path);
    }
    remove_directory_entries(path)?;
    ignore_not_found(fs::remove_dir(path), "rmdir", path)
}

/// Suppresses `NotFound` errors and wraps any other error with its syscall `op` and `path`.
#[inline]
fn ignore_not_found(result: io::Result<()>, op: &'static str, path: &Path) -> io::Result<()> {
    match result {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(failure(error, op, path)),
    }
}

/// Recursively deletes every entry inside `path` via [`directory`].
#[inline]
fn remove_directory_entries(path: &Path) -> io::Result<()> {
    for entry in fs::read_dir(path).map_err(|error| failure(error, "scandir", path))? {
        let entry = entry.map_err(|error| failure(error, "scandir", path))?;
        directory(&entry.path())?;
    }
    Ok(())
}

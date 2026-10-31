//! Keep the failing operation and path when deleting consumed coverage artifacts.
use crate::commands::workspace_command::filesystem_error::failure;
use std::{fs, io, path::Path};

pub(super) fn directory(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty() || path.to_string_lossy().trim().is_empty() {
        return Ok(());
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(failure(error, "lstat", path)),
    };
    if !metadata.is_dir() {
        return fs::remove_file(path).map_err(|error| failure(error, "unlink", path));
    }
    remove_directory_entries(path)?;
    fs::remove_dir(path).map_err(|error| failure(error, "rmdir", path))
}

fn remove_directory_entries(path: &Path) -> io::Result<()> {
    for entry in fs::read_dir(path).map_err(|error| failure(error, "scandir", path))? {
        let entry = entry.map_err(|error| failure(error, "scandir", path))?;
        directory(&entry.path())?;
    }
    Ok(())
}

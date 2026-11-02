//! Init owns errors after its first filesystem effect; it never delegates a partial workspace.
//!
//! [`apply`] executes ordered [`Action`] entries (`Directory`, `File`, [`remove`], [`empty`]) from [`Plan`] on disk.
use super::plan::{Action, Plan};
use std::{fs, io, path::Path};

/// Executes all staged filesystem [`Action`]s in `plan` in order.
#[inline]
pub(super) fn apply(plan: Plan) -> io::Result<()> {
    for action in plan.actions {
        match action {
            Action::Directory(path) if !path.as_os_str().is_empty() => fs::create_dir_all(path)?,
            Action::Directory(_) => {}
            Action::Remove(path) => remove(&path)?,
            Action::Empty(path) => empty(&path)?,
            Action::File(path, bytes) => {
                if let Some(parent) = path
                    .parent()
                    .filter(|dir| !dir.as_os_str().is_empty())
                {
                    fs::create_dir_all(parent)?;
                }
                if fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
                    remove_leaf(&path)?;
                }
                fs::write(path, bytes)?;
            }
        }
    }
    Ok(())
}
/// Removes `path` recursively if a directory or unlinks it if a file or symlink, ignoring missing paths.
#[inline]
fn remove(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty() {
        return Ok(());
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            fs::remove_dir_all(path)
        }
        Ok(_) => remove_leaf(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
/// Removes a single file or symlink at `path` on Unix platforms.
#[cfg(not(windows))]
#[inline]
fn remove_leaf(path: &Path) -> io::Result<()> {
    fs::remove_file(path)
}
/// Removes a single file, symlink, or Windows directory junction at `path`.
#[cfg(windows)]
#[inline]
fn remove_leaf(path: &Path) -> io::Result<()> {
    use std::os::windows::fs::FileTypeExt;
    if fs::symlink_metadata(path)?.file_type().is_symlink_dir() {
        fs::remove_dir(path)
    } else {
        fs::remove_file(path)
    }
}

/// Ensures `path` exists as an empty directory, removing any existing files, subdirectories, or symlinks.
#[inline]
fn empty(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty() {
        return Ok(());
    }
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_dir() || meta.file_type().is_symlink() => {
            remove_leaf(path)?;
            fs::create_dir_all(path)
        }
        Ok(_) => {
            for entry in fs::read_dir(path)? {
                remove(&entry?.path())?;
            }
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir_all(path),
        Err(error) => Err(error),
    }
}

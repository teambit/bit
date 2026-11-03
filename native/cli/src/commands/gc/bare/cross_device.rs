//! `fs-extra.move` ([`copy_remove`], [`copy_link`], [`create_symlink`], [`failure`], [`paired_failure`]) copies across devices, preserving link text before removing the source.
use super::super::io_error::{failure, paired_failure};
use std::{fs, io, path::Path};

/// Copies `source` ([`Path`]) to `target` (preserving symlinks via [`copy_link`]) and unlinks `source` when `rename` crosses devices.
#[inline]
pub(super) fn copy_remove(source: &Path, target: &Path) -> io::Result<()> {
    if source.as_os_str().is_empty() || target.as_os_str().is_empty() {
        return Err(io::Error::from(io::ErrorKind::InvalidInput));
    }
    if source == target {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(source).map_err(|error| failure(error, "lstat", source))?;
    if metadata.is_dir() {
        return Err(paired_failure(
            io::Error::from(io::ErrorKind::InvalidInput),
            "copyfile",
            source,
            target,
        ));
    }
    if metadata.is_symlink() {
        copy_link(source, target)?;
    } else {
        fs::copy(source, target)
            .map_err(|error| paired_failure(error, "copyfile", source, target))?;
    }
    fs::remove_file(source).map_err(|error| failure(error, "unlink", source))
}
/// Recreates the symbolic link at `source` under `target` via [`create_symlink`], replacing any existing file at `target`.
#[inline]
fn copy_link(source: &Path, target: &Path) -> io::Result<()> {
    let link = fs::read_link(source).map_err(|error| failure(error, "readlink", source))?;
    if link.as_os_str().is_empty() {
        return Err(failure(io::Error::from(io::ErrorKind::InvalidInput), "readlink", source));
    }
    if fs::symlink_metadata(target).is_ok() {
        fs::remove_file(target).map_err(|error| failure(error, "unlink", target))?;
    }
    create_symlink(&link, target).map_err(|error| paired_failure(error, "symlink", &link, target))
}

/// Creates a symbolic link at `target` pointing to `link` for [`copy_link`] using the platform symlink syscall.
#[inline]
fn create_symlink(link: &Path, target: &Path) -> io::Result<()> {
    #[cfg(unix)]
    return std::os::unix::fs::symlink(link, target);
    #[cfg(windows)]
    return std::os::windows::fs::symlink_file(link, target);
}

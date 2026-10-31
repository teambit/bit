//! `fs-extra.move` copies across devices, preserving link text before removing the source.
use super::super::io_error::{failure, paired_failure};
use std::{fs, io, path::Path};

pub(super) fn copy_remove(source: &Path, target: &Path) -> io::Result<()> {
    if source.as_os_str().is_empty() || target.as_os_str().is_empty() {
        return Err(io::Error::from(io::ErrorKind::InvalidInput));
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
fn copy_link(source: &Path, target: &Path) -> io::Result<()> {
    let link = fs::read_link(source).map_err(|error| failure(error, "readlink", source))?;
    if link.as_os_str().is_empty() {
        return Err(failure(io::Error::from(io::ErrorKind::InvalidInput), "readlink", source));
    }
    create_symlink(&link, target).map_err(|error| paired_failure(error, "symlink", &link, target))
}

fn create_symlink(link: &Path, target: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(link, target)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(link, target)
    }
}

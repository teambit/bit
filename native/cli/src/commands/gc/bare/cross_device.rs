//! `fs-extra.move` copies across devices, preserving link text before removing the source.
use super::super::io_error::{failure, paired_failure};
use std::{fs, io, path::Path};

pub(super) fn copy_remove(source: &Path, target: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(source).map_err(|error| failure(error, "lstat", source))?;
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
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(&link, target);
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_file(&link, target);
    result.map_err(|error| paired_failure(error, "symlink", &link, target))
}

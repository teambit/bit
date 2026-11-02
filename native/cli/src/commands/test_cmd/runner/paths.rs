//! Lexically normalize absolute filesystem paths without following symlinks.
//!
//! [`normalized`] resolves `.` and `..` segments in a [`Path`] into a clean [`PathBuf`] without disk I/O.
use std::path::{Path, PathBuf};

/// Lexically normalizes `.` and `..` segments in `path` into a clean [`PathBuf`] without disk I/O or symlink traversal.
#[inline]
pub(super) fn normalized(path: &Path) -> PathBuf {
    let path = path.to_str().map_or(path, |text| Path::new(text.trim()));
    if path.as_os_str().is_empty() {
        return PathBuf::new();
    }
    let mut result = PathBuf::with_capacity(path.as_os_str().len());
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if result.as_os_str().is_empty() || result.ends_with("..") {
                    result.push("..");
                } else {
                    result.pop();
                }
            }
            other => result.push(other),
        }
    }
    result
}

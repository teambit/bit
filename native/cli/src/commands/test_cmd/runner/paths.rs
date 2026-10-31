//! Lexically normalize absolute filesystem paths without following symlinks.
use std::path::{Path, PathBuf};

pub(super) fn normalized(path: &Path) -> PathBuf {
    if path.as_os_str().is_empty() {
        return PathBuf::new();
    }
    let mut result = PathBuf::new();
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

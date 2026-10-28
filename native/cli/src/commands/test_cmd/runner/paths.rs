//! Lexically normalize absolute filesystem paths without following symlinks.
use std::path::{Path, PathBuf};

pub(super) fn normalized(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        if component == std::path::Component::ParentDir {
            result.pop();
        } else {
            result.push(component);
        }
    }
    result
}

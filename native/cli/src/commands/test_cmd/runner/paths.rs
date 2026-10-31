//! Lexically normalize absolute filesystem paths without following symlinks.
use std::path::{Path, PathBuf};

pub(super) fn normalized(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                result.pop();
            }
            other => result.push(other),
        }
    }
    result
}

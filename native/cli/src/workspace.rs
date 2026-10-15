//! Facts about the workspace a command runs in, read without loading it.

use std::path::{Path, PathBuf};

/// The closest directory at or above `cwd` holding `workspace.jsonc`.
pub fn root(cwd: &Path) -> Option<PathBuf> {
    cwd.ancestors()
        .find(|dir| dir.join("workspace.jsonc").is_file())
        .map(Path::to_path_buf)
}

/// `Consumer._getScopePath`: `.bit`, unless only a real `.git` directory
/// exists, which hosts the scope at `.git/bit`.
pub fn scope_path(root: &Path) -> PathBuf {
    let standalone = root.join(".bit");
    let git = root.join(".git");
    if git.is_dir() && !standalone.exists() { git.join("bit") } else { standalone }
}

//! The workspace scope location used by `Consumer._getScopePath`.

use std::path::{Path, PathBuf};

/// Prefer `.bit`; a real `.git` directory otherwise hosts the scope at `.git/bit`.
/// Git worktrees and submodules have a `.git` file and retain the standalone scope.
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    let standalone = root.join(".bit");
    let git = root.join(".git");
    if git.is_dir() && !standalone.exists() { git.join("bit") } else { standalone }
}

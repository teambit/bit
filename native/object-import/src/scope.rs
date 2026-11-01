//! Canonical workspace and bare-scope directory discovery shared by native operations.
use std::path::{Path, PathBuf};

/// Locate the workspace or bare-scope directory for `root` via `bit_workspace_config`.
#[inline]
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    bit_workspace_config::scope_path(root)
}

//! Canonical workspace scope discovery shared by native operations.
use std::path::{Path, PathBuf};

/// Locate the workspace or bare-scope directory for `root`.
#[inline]
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    bit_workspace_config::scope_path(root)
}

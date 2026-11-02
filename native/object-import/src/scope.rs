//! Canonical workspace and bare-scope directory discovery ([`path`]) shared by native operations.
use std::path::{Path, PathBuf};

/// Locates the workspace (`.bit` / `.git/bit`) or bare-scope directory for `root`.
#[inline]
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    bit_workspace_config::scope_path(root)
}

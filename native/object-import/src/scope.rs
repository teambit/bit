//! Canonical workspace (`.bit` / `.git/bit`) and bare-scope directory discovery ([`path`], [`bit_workspace_config::scope_path`]) shared by native operations.
use std::path::{Path, PathBuf};

/// Locates the workspace (`.bit` / `.git/bit`) or bare-scope directory for `root` via [`bit_workspace_config::scope_path`].
#[inline]
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    bit_workspace_config::scope_path(root)
}

//! Canonical workspace (`.bit` / `.git/bit`) and bare-scope directory discovery ([`path`], [`Path`], [`PathBuf`], [`bit_workspace_config::scope_path`]) shared by native operations.
use std::path::{Path, PathBuf};

/// Locates the workspace (`.bit` / `.git/bit`) or bare-scope [`PathBuf`] for `root` via [`bit_workspace_config::scope_path`].
///
/// Prefers `.git/bit` when a Git directory exists at `root/.git`, falling back to `root/.bit` or `root`.
#[inline]
#[must_use]
pub fn path(root: &Path) -> PathBuf {
    bit_workspace_config::scope_path(root)
}

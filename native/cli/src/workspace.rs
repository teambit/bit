//! Workspace and repository paths read directly without loading Harmony.
//!
//! Re-exports [`scope_path`] and [`root`] (`workspace_root`) from `bit_workspace_config` for fast workspace/scope path lookup.

/// Re-exported workspace [`root`] and [`.bit` / `bit` scope directory](scope_path) discovery helpers.
pub use bit_workspace_config::{scope_path, workspace_root as root};

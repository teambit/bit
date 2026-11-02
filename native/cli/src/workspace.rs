//! Workspace and repository paths read directly without loading Harmony.
//!
//! Re-exports [`scope_path`] and [`root`] (`workspace_root`) from `bit_workspace_config` without loading Harmony.

/// Re-exported workspace root and scope directory discovery helpers.
pub use bit_workspace_config::{scope_path, workspace_root as root};

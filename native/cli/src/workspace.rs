//! Workspace and repository paths read directly without loading Harmony.
//!
//! Re-exports [`scope_path`] and [`root`] from `bit_workspace_config`.

pub use bit_workspace_config::{scope_path, workspace_root as root};

//! Shared native variant namespace glob matching helpers.
//!
//! Re-exports [`matches`] (`bit_workspace_config::variants::matches_namespace`) for workspace variant glob tests.

/// Re-exported namespace glob pattern matcher (`bit_workspace_config::variants::matches_namespace`) for workspace variant tests.
pub use bit_workspace_config::variants::matches_namespace as matches;

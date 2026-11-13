//! Shared native workspace variant matching helpers for [`VariantConfig`] and [`by_root_dir_and_name`].
//!
//! Re-exports [`VariantConfig`] and [`by_root_dir_and_name`] from `bit_workspace_config::variants` for workspace loading.

/// Re-exported [`VariantConfig`] and [`by_root_dir_and_name`] workspace variant matchers from `bit_workspace_config::variants` for `bit install` loading.
pub use bit_workspace_config::variants::{VariantConfig, by_root_dir_and_name};

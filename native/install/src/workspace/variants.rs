//! Shared native workspace variant matching helpers for [`VariantConfig`].
//!
//! Re-exports [`VariantConfig`] and [`by_root_dir_and_name`] from `bit_workspace_config::variants` for workspace loading.

/// Re-exported [`VariantConfig`] and [`by_root_dir_and_name`] workspace variant matcher from `bit_workspace_config::variants`.
pub use bit_workspace_config::variants::{VariantConfig, by_root_dir_and_name};

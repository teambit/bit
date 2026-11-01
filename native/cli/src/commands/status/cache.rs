//! The `no-fs-cache` feature, which makes the native capture detect dependencies
//! afresh without cache writes, and Bit's cache root ([`cache_root`]).
//! `dependencyCacheNeedsInvalidation` lives with the dependency cache in
//! `bit_install::dependencies::cache::invalidation`.
//!
//! Resolves feature flags from [`global_config_dir`] and environment variables.

pub use bit_workspace_config::cache_root;

use bit_workspace_config::global_config_dir;
use std::{env, fs, path::Path};

const NO_FS_CACHE: &str = "no-fs-cache";

/// Whether `no-fs-cache` may be enabled in any config layer: `BIT_FEATURES`,
/// `BIT_CONFIG_FEATURES`, the workspace's config store, `scope.json` or the
/// global config. Layer precedence is not resolved: a mention anywhere declines.
#[must_use]
pub fn no_fs_cache(root: &Path) -> bool {
    if ["BIT_FEATURES", "BIT_CONFIG_FEATURES"]
        .iter()
        .any(|name| {
            env::var_os(name).is_some_and(|value| mentions_no_fs_cache(&value.to_string_lossy()))
        })
    {
        return true;
    }
    let files = [
        root.join("workspace.jsonc"),
        crate::workspace::scope_path(root).join("scope.json"),
        global_config_dir().join("config.json"),
    ];
    files
        .iter()
        .any(|file| {
            fs::read(file)
                .is_ok_and(|bytes| {
                    bytes
                        .windows(NO_FS_CACHE.len())
                        .any(|window| window.eq_ignore_ascii_case(NO_FS_CACHE.as_bytes()))
                })
        })
}

#[inline]
fn mentions_no_fs_cache(value: &str) -> bool {
    value
        .split([',', ';', ':', ' ', '\t', '\n', '\r'])
        .any(|feature| {
            feature
                .trim()
                .trim_matches(['"', '\''])
                .trim()
                .eq_ignore_ascii_case(NO_FS_CACHE)
        })
}

#[must_use]
#[inline]
pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

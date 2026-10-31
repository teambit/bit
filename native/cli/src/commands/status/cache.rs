//! The `no-fs-cache` feature, which makes the native capture detect dependencies
//! afresh without cache writes, and Bit's cache root.
//! `dependencyCacheNeedsInvalidation` lives with the dependency cache in
//! `bit_install::dependencies::cache::invalidation`.

pub use bit_workspace_config::cache_root;

use bit_workspace_config::global_config_dir;
use std::{env, fs, path::Path};

const NO_FS_CACHE: &str = "no-fs-cache";

/// Whether `no-fs-cache` may be enabled in any config layer: `BIT_FEATURES`,
/// `BIT_CONFIG_FEATURES`, the workspace's config store, `scope.json` or the
/// global config. Layer precedence is not resolved: a mention anywhere declines.
pub fn no_fs_cache(root: &Path) -> bool {
    let from_env = ["BIT_FEATURES", "BIT_CONFIG_FEATURES"]
        .iter()
        .any(|name| env::var(name).is_ok_and(|value| mentions_no_fs_cache(&value)));
    let files = [
        root.join("workspace.jsonc"),
        crate::workspace::scope_path(root).join("scope.json"),
        global_config_dir().join("config.json"),
    ];
    from_env
        || files
            .iter()
            .any(|file| fs::read_to_string(file).is_ok_and(|text| text.contains(NO_FS_CACHE)))
}

fn mentions_no_fs_cache(value: &str) -> bool {
    value
        .split([',', ';', ' ', '\t'])
        .any(|feature| feature.trim().eq_ignore_ascii_case(NO_FS_CACHE))
}

pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

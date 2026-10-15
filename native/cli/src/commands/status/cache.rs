//! The `no-fs-cache` feature, which makes the native capture detect dependencies
//! afresh without cache writes, and Bit's cache root.
//! `dependencyCacheNeedsInvalidation` lives with the dependency cache in
//! `bit_install::dependencies::cache::invalidation`.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

const NO_FS_CACHE: &str = "no-fs-cache";

/// Whether `no-fs-cache` may be enabled in any config layer: `BIT_FEATURES`,
/// `BIT_CONFIG_FEATURES`, the workspace's config store, `scope.json` or the
/// global config. Layer precedence is not resolved: a mention anywhere declines.
pub fn no_fs_cache(root: &Path) -> bool {
    let mentions = |value: &str| {
        value
            .split(',')
            .any(|feature| feature.trim() == NO_FS_CACHE)
    };
    let from_env = ["BIT_FEATURES", "BIT_CONFIG_FEATURES"]
        .iter()
        .any(|name| env::var(name).is_ok_and(|value| mentions(&value)));
    let files = [
        root.join("workspace.jsonc"),
        root.join(".bit").join("scope.json"),
        global_config_dir().join("config.json"),
    ];
    from_env
        || files
            .iter()
            .any(|file| fs::read_to_string(file).is_ok_and(|text| text.contains(NO_FS_CACHE)))
}

/// `GLOBAL_CONFIG` of `@teambit/legacy.constants`.
fn global_config_dir() -> PathBuf {
    cache_root().join("config")
}

/// `CACHE_ROOT` of `@teambit/legacy.constants`.
pub fn cache_root() -> PathBuf {
    let home = || {
        PathBuf::from(
            env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
        )
    };
    if let Some(dir) = env::var_os("BIT_GLOBALS_DIR").filter(|dir| !dir.is_empty()) {
        PathBuf::from(dir)
    } else if cfg!(any(target_os = "linux", target_os = "macos")) {
        home()
            .join("Library")
            .join("Caches")
            .join("Bit")
    } else if let Some(local) = env::var_os("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        PathBuf::from(local).join("Bit")
    } else {
        home().join(".bit")
    }
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

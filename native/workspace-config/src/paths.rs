//! Cache locations from the published legacy.constants module.
use std::{env, path::PathBuf};

/// `GLOBAL_CONFIG` contains config.json below `CACHE_ROOT`.
#[must_use]
pub fn global_config_dir() -> PathBuf {
    cache_root().join("config")
}

/// `CACHE_ROOT` honors `BIT_GLOBALS_DIR` before the published platform-specific defaults.
#[must_use]
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
    } else if let Some(local) =
        env::var_os("LOCALAPPDATA").filter(|local| cfg!(windows) && !local.is_empty())
    {
        PathBuf::from(local).join("Bit")
    } else {
        home().join(".bit")
    }
}

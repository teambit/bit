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
    let non_empty =
        |key: &str| env::var_os(key).filter(|val| !val.to_string_lossy().trim().is_empty());
    let home = || {
        PathBuf::from(
            non_empty(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .or_else(|| non_empty("HOME"))
                .unwrap_or_default(),
        )
    };
    if let Some(dir) = non_empty("BIT_GLOBALS_DIR") {
        PathBuf::from(dir)
    } else if cfg!(any(target_os = "linux", target_os = "macos")) {
        home()
            .join("Library")
            .join("Caches")
            .join("Bit")
    } else if let Some(local) = non_empty("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        PathBuf::from(local).join("Bit")
    } else {
        home().join(".bit")
    }
}

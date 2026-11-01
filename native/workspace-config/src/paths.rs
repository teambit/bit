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
        non_empty_env(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .or_else(|| non_empty_env("HOME"))
            .unwrap_or_default()
    };
    if let Some(dir) = non_empty_env("BIT_GLOBALS_DIR") {
        dir
    } else if cfg!(any(target_os = "linux", target_os = "macos")) {
        home()
            .join("Library")
            .join("Caches")
            .join("Bit")
    } else if let Some(local) = non_empty_env("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        local.join("Bit")
    } else {
        home().join(".bit")
    }
}

fn non_empty_env(key: &str) -> Option<PathBuf> {
    let val = env::var_os(key)?;
    if let Some(text) = val.to_str() {
        let trimmed = text.trim();
        return (!trimmed.is_empty()).then(|| PathBuf::from(trimmed));
    }
    (!val.is_empty()).then(|| PathBuf::from(val))
}

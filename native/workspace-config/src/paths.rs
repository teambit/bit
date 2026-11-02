//! Global config [`global_config_dir`] and [`cache_root`] locations from `legacy.constants`.
use std::{env, path::PathBuf};

/// `GLOBAL_CONFIG` contains `config.json` below [`cache_root`].
#[must_use]
#[inline]
pub fn global_config_dir() -> PathBuf {
    cache_root().join("config")
}

/// `CACHE_ROOT` honors `BIT_GLOBALS_DIR` before the published platform-specific defaults.
#[must_use]
#[inline]
pub fn cache_root() -> PathBuf {
    if let Some(dir) = non_empty_env("BIT_GLOBALS_DIR") {
        return dir;
    }
    if cfg!(any(target_os = "linux", target_os = "macos")) {
        home_dir()
            .join("Library")
            .join("Caches")
            .join("Bit")
    } else if let Some(local) = non_empty_env("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        local.join("Bit")
    } else {
        home_dir().join(".bit")
    }
}

/// Resolves the user's home directory from `USERPROFILE` (on Windows) or `HOME`.
#[inline]
fn home_dir() -> PathBuf {
    non_empty_env(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .or_else(|| non_empty_env("HOME"))
        .unwrap_or_default()
}

#[inline]
fn non_empty_env(key: &str) -> Option<PathBuf> {
    let val = env::var_os(key)?;
    if let Some(text) = val.to_str() {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return None;
        }
        return Some(if trimmed.len() == text.len() {
            PathBuf::from(val)
        } else {
            PathBuf::from(trimmed)
        });
    }
    (!val.is_empty()).then(|| PathBuf::from(val))
}

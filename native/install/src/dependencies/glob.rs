//! Shared `minimatch` pattern matcher for component dev-file classification.
//!
//! [`match_patterns`] and [`matches`] delegate non-empty glob pattern checks to `bit_workspace_config::glob`.

/// Return `true` when `path` matches any glob pattern in `patterns`.
#[inline]
#[must_use]
pub fn match_patterns(path: &str, patterns: &[String]) -> bool {
    !patterns.is_empty() && bit_workspace_config::glob::match_patterns(path, patterns)
}

/// Return `true` when `path` matches the single non-empty glob `pattern`.
#[inline]
#[must_use]
pub fn matches(path: &str, pattern: &str) -> bool {
    !pattern.trim().is_empty() && bit_workspace_config::glob::matches(path, pattern)
}

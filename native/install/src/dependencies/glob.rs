//! Shared minimatch pattern matcher.

#[inline]
#[must_use]
pub fn match_patterns(path: &str, patterns: &[String]) -> bool {
    !patterns.is_empty() && bit_workspace_config::glob::match_patterns(path, patterns)
}

#[inline]
#[must_use]
pub fn matches(path: &str, pattern: &str) -> bool {
    !pattern.trim().is_empty() && bit_workspace_config::glob::matches(path, pattern)
}

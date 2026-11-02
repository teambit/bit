//! Complete independently qualified stream diagnostics ([`Comparison`], [`assert_errors`]), with exact byte comparison as default.
//!
//! Supports optional stdout/stderr normalization, error-variant matching, and artifact projections.

#[cfg(test)]
mod tests;

/// Stream and scope comparison configuration for replay assertions.
#[derive(Clone, Copy)]
pub(super) struct Comparison<'a> {
    pub stdout: fn(&str) -> String,
    pub stderr: Option<fn(&str) -> String>,
    pub errors: Option<&'a [String; 2]>,
    pub scope_additions: Option<&'a std::collections::BTreeMap<String, Vec<u8>>>,
    pub colors: bool,
    pub artifacts: Option<&'a super::ArtifactProjection<'a>>,
}

impl Comparison<'_> {
    /// Constructs a [`Comparison`] requiring exact stderr and artifact parity with `stdout` projection.
    pub fn exact(stdout: fn(&str) -> String) -> Self {
        Self {
            stdout,
            stderr: None,
            errors: None,
            scope_additions: None,
            colors: false,
            artifacts: None,
        }
    }
}

/// Asserts that both `actual` and `expected` match one of the two distinct error `variants` in [`Comparison`].
pub(super) fn assert_errors(actual: &str, expected: &str, variants: &[String; 2]) {
    assert!(!variants[0].is_empty() && !variants[1].is_empty());
    assert_ne!(variants[0], variants[1], "independent Node stream states must differ");
    assert!(
        variants
            .iter()
            .any(|value| value == expected),
        "unqualified Node diagnostic: {expected}",
    );
    assert!(
        variants
            .iter()
            .any(|value| value == actual),
        "unqualified native diagnostic: {actual}",
    );
}

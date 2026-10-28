//! Complete independently qualified diagnostics, with exact comparison as the default.
#[cfg(test)]
mod tests;

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

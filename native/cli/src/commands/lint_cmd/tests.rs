//! Unit tests for `bit lint` [`Options`] CLI parsing ([`parse_options`]), missing host detection ([`is_missing_host`]), and workspace pattern validation ([`validate_lint_pattern`]).
//!
//! Verifies `--changed`, `--fix`, `--fix-type`, and [`Chalk`] pattern diagnostic messages.

use super::{Options, is_missing_host, parse_options, validate_lint_pattern};
use crate::commands::color::Chalk;
use std::fs;

/// Verifies `bit lint` option parsing and missing workspace host detection.
#[test]
fn parses_lint_options_and_detects_missing_host() {
    let opts = parse_options(&["ui/*", "-c", "-f", "--fix-type", "problem", "--json"]).unwrap();
    assert_eq!(
        opts,
        Options {
            pattern: Some("ui/*".into()),
            changed: true,
            fix: true,
            fix_type: Some("problem".into()),
            json: true,
        },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_host(temp.path()));
}

/// Verifies [`validate_lint_pattern`] diagnostic messages for missing glob and component-ID patterns.
#[test]
fn validates_lint_pattern_against_workspace_bitmap() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace":{"defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert_eq!(
        validate_lint_pattern(temp.path(), Some("ui/*"), Chalk::new(false)).as_deref(),
        Some(r#"unable to find any component matching the "ui/*" pattern"#),
    );
    assert_eq!(
        validate_lint_pattern(temp.path(), Some("my-scope/missing"), Chalk::new(false)).as_deref(),
        Some(
            "error: component \"my-scope/missing\" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit create' (see 'bit create --help' for more information)"
        ),
    );
}

/// Verifies that [`validate_lint_pattern`] returns `None` when no pattern filter is provided.
#[test]
fn none_lint_pattern_passes_workspace_validation() {
    let temp = tempfile::tempdir().unwrap();
    assert!(validate_lint_pattern(temp.path(), None, Chalk::new(false)).is_none());
}

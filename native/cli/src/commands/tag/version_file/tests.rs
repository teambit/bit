//! Unit tests for `bit tag --versions-file` version plan parsing ([`parse`]) and malformed-line rejection.
//!
//! Verifies BOM stripping, `#` comments, `DEFAULT:` entries, and duplicate component overrides across [`parse`].

use super::parse;
use serde_json::json;

/// Verifies `bit tag --versions-file` [`parse`] handles BOMs, comments, `DEFAULT:` [`json`] entries, and malformed lines.
///
/// Confirms duplicate component entries are preserved in order while later `DEFAULT:` lines override earlier ones.
#[test]
fn comments_defaults_duplicates_and_exact_component_names() {
    let parsed=parse("\u{feff}# version plan\r\n DEFAULT: patch\n remote/foo: minor\n remote/foo: 2.0.0-beta.1\nDEFAULT: 4.0.0\n").unwrap();
    assert_eq!(
        parsed,
        json!({"entries":[{"identity":"remote/foo","version":"minor"},{"identity":"remote/foo","version":"2.0.0-beta.1"}],"default":"4.0.0"}),
    );
    for content in ["DEFAULT:", "missing-colon", ": patch", "remote/foo:"] {
        assert!(parse(content).is_err());
    }
}

/// Verifies that [`parse`] parses a version plan containing only comments and whitespace to empty `entries`.
///
/// Ensures blank lines and `#` comment lines produce `entries: []` and `default: null`.
#[test]
fn comment_and_blank_only_version_file_parses_to_empty_entries() {
    let parsed = parse("# comment only\n\n  \n").unwrap();
    assert_eq!(parsed, json!({"entries": [], "default": null}));
}

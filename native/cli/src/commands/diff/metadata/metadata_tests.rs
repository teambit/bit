//! Unit tests for `bit diff` field-name prettification ([`prettify`]) and component [`Id`] equality.
//!
//! Verifies camelCase-to-title labeling and versioned versus `latest` [`Id`] comparison.

use super::prettify;
use crate::commands::ids::Id;

/// Verifies that [`prettify`] converts camelCase diff field names into title-case display labels.
#[test]
fn prettifies_field_names() {
    assert_eq!(prettify("packageName"), "Package Name");
    assert_eq!(prettify("mainFile"), "Main File");
    assert_eq!(prettify("files"), "Files");
}

/// Verifies [`Id::parse`], [`Id::from_object`], and [`Id::same`] versioned and unversioned comparisons.
#[test]
fn parses_ids_like_bit_id() {
    let id = Id::parse("my.scope/ui/button@1.0.0").unwrap();
    assert_eq!(id.without_version(), "my.scope/ui/button");
    assert_eq!(id.version.as_deref(), Some("1.0.0"));
    assert_eq!(Id::parse("my.scope/a").unwrap().version.as_deref(), Some("latest"));
    assert!(Id::parse("noscope").is_err());
    let latest = Id::parse("s/a").unwrap();
    let unversioned = Id::from_object(&serde_json::json!({ "scope": "s", "name": "a" })).unwrap();
    assert!(latest.same(&unversioned));
    assert!(!latest.same(&Id::parse("s/a@1.0.0").unwrap()));
}

/// Verifies that [`prettify`] returns an empty string when given an empty input.
///
/// Ensures empty field labels do not panic during title-case conversion.
#[test]
fn prettify_empty_string_returns_empty() {
    assert_eq!(prettify(""), "");
}

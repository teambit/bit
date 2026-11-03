//! Unit tests for `--versions-file` explicit entry and default release matching via [`tag_data`] in `bit-object-import`.
//!
//! Checks first-match explicit component [`Value`] version entries, prerelease ID extraction, and default fallback via [`tag_data`] ([`explicit_first_match_and_default_cover_selected_and_automatic_components`], [`absent_versions_file_returns_null_and_malformed_entries_field_declines`]).

use super::tag_data;
use serde_json::{Value, json};

/// Verifies that [`tag_data`] resolves first-match explicit `--versions-file` entries, prerelease IDs, and `default` release types.
#[test]
fn explicit_first_match_and_default_cover_selected_and_automatic_components() {
    let file = json!({"entries":[{"identity":"remote/foo","version":"2.0.0-beta.1"},{"identity":"remote/foo","version":"3.0.0"}],"default":"minor"});
    assert_eq!(
        tag_data(Some(&file), "remote/foo").unwrap(),
        json!({"versionToTag":"2.0.0-beta.1","prereleaseId":"beta"}),
    );
    assert_eq!(
        tag_data(Some(&file), "remote/bar").unwrap(),
        json!({"versionToTag":"minor","prereleaseId":null}),
    );
    assert_eq!(
        tag_data(Some(&json!({"entries":[],"default":null})), "remote/foo").unwrap(),
        Value::Null,
    );
}

/// Verifies that [`tag_data`] returns [`Value::Null`] when no `--versions-file` is provided and declines non-array `entries` ([`json`]).
#[test]
fn absent_versions_file_returns_null_and_malformed_entries_field_declines() {
    assert_eq!(tag_data(None, "remote/foo").unwrap(), Value::Null);
    assert!(tag_data(Some(&json!({"entries":"invalid"})), "remote/foo").is_err());
}

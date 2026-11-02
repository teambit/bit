//! Unit tests for lane squash commit message replacement via [`replace_message`] ([`message_replacement_keeps_author_and_ordered_modification_history`], [`message_replacement_rejects_missing_duplicate_or_invalid_dates_before_mutation`]) and modification logs in `bit-object-import`.
//!
//! Ensures squash commit messages preserve original author details and append ordered modification records via [`replace_message`] for empty and non-empty messages.

use super::replace_message;
use serde_json::json;

/// Verifies that [`replace_message`] preserves original author fields (`username`, `email`, `date`) and appends ordered squash modification log entries.
#[test]
fn message_replacement_keeps_author_and_ordered_modification_history() {
    for previous in ["original", ""] {
        let mut version = json!({"log":{"message":previous,"username":"author","email":"author@example.test","date":"1"},"modified":[{"date":"2","message":"squashed"}]});
        let receipt = json!({"squashMessages":[{"hash":"target","date":"3"}]});
        replace_message(&mut version, "target", "title\n[*] incoming", &receipt).unwrap();
        assert_eq!(
            version["log"],
            json!({"message":"title\n[*] incoming","username":"author","email":"author@example.test","date":"1"}),
        );
        let old = if previous.is_empty() { "<empty>" } else { previous };
        assert_eq!(
            version["modified"],
            json!([
                {"date":"2","message":"squashed"},
                {"date":"3","message":format!(r#"squashing: replacing the original log.message, which was: "{old}""#)}
            ]),
        );
    }
}

/// Verifies that [`replace_message`] rejects missing, duplicate, or non-numeric squash receipt timestamps without mutating `version`.
#[test]
fn message_replacement_rejects_missing_duplicate_or_invalid_dates_before_mutation() {
    for receipts in [
        json!([]),
        json!([{"hash":"other","date":"3"}]),
        json!([{"hash":"target","date":"3"},{"hash":"target","date":"4"}]),
        json!([{"hash":"target","date":"invalid"}]),
    ] {
        let original = json!({"log":{"message":"original"},"modified":[]});
        let mut version = original.clone();
        assert!(
            replace_message(&mut version, "target", "title", &json!({"squashMessages":receipts}))
                .is_err(),
        );
        assert_eq!(version, original);
    }
}

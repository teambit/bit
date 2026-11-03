//! Unit tests for `bit run-action` [`Options`] JSON payload CLI parsing ([`parse_options`]) and command-runner result formatting ([`report`]).
//!
//! Verifies `ExportPersist` JSON payload parsing in [`parse_options`] and falsy/truthy action result formatting in [`report`].

use super::{Options, parse_options, report};
use serde_json::json;

/// Verifies `bit run-action` [`Options`] [`json`] payload parsing via [`parse_options`].
///
/// Confirms malformed JSON payloads and unknown flags return `None`.
#[test]
fn parses_and_validates_run_action_json() {
    assert_eq!(parse_options(&["ExportPersist", "my-scope", "not-json"]), None);
    assert_eq!(parse_options(&["ExportPersist", "my-scope", "{}", "--unknown"]), None);
    assert_eq!(
        parse_options(&["ExportPersist", "my-scope", r#"{"exportId":"123"}"#, "--no-color"]),
        Some(Options {
            action_name: "ExportPersist".into(),
            remote: "my-scope".into(),
            payload: json!({ "exportId": "123" }),
        }),
    );
}

/// Verifies that [`report`] formats falsy, string, plain-object, and structured `{ data, code }` payloads.
#[test]
fn formats_action_results_like_command_runner() {
    for falsy in [json!(null), json!(false), json!(0), json!("")] {
        let rendered = report(&falsy).unwrap();
        assert_eq!((rendered.data.as_str(), rendered.code), ("", 0));
    }
    let text = report(&json!("persisted")).unwrap();
    assert_eq!((text.data.as_str(), text.code), ("persisted", 0));
    let object = report(&json!({"exists": true})).unwrap();
    assert_eq!((object.data.as_str(), object.code), ("undefined", 0));
    let structured = report(&json!({"data": "custom", "code": 2})).unwrap();
    assert_eq!((structured.data.as_str(), structured.code), ("custom", 2));
}

/// Verifies that [`parse_options`] rejects fewer than three positional arguments.
///
/// Ensures `bit run-action` requires `action_name`, `remote`, and a JSON `payload`.
#[test]
fn rejects_too_few_run_action_positional_arguments() {
    assert_eq!(parse_options(&[]), None);
    assert_eq!(parse_options(&["ExportPersist", "my-scope"]), None);
}

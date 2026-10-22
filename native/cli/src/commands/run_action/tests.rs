use super::{Options, parse_options};
use serde_json::json;

#[test]
fn parses_and_validates_run_action_json() {
    assert_eq!(parse_options(&["ExportPersist", "my-scope", "not-json"]), None);
    assert_eq!(
        parse_options(&["ExportPersist", "my-scope", r#"{"exportId":"123"}"#]),
        Some(Options {
            action_name: "ExportPersist".into(),
            remote: "my-scope".into(),
            payload: json!({ "exportId": "123" }),
        }),
    );
}

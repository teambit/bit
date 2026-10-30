use super::{Options, parse_options, report};
use serde_json::json;

#[test]
fn parses_and_validates_run_action_json() {
    assert_eq!(parse_options(&["ExportPersist", "my-scope", "not-json"]), None);
    assert_eq!(parse_options(&["ExportPersist", "my-scope", "{}", "--no-color"]), None);
    assert_eq!(
        parse_options(&["ExportPersist", "my-scope", r#"{"exportId":"123"}"#]),
        Some(Options {
            action_name: "ExportPersist".into(),
            remote: "my-scope".into(),
            payload: json!({ "exportId": "123" }),
        }),
    );
}

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

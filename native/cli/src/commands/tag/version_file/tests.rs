use super::parse;
use serde_json::json;

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

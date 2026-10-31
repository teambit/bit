use super::{is_extension_configured, parse_target};
use serde_json::json;
use std::ffi::OsString;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_target() {
    assert_eq!(parse_target(&os_args(&["use", "my-aspect"])), Some("my-aspect".to_owned()));
    assert_eq!(
        parse_target(&os_args(&["use", "scope/my-aspect", "--no-color"])),
        Some("scope/my-aspect".to_owned()),
    );
}

#[test]
fn rejects_invalid_args() {
    assert_eq!(parse_target(&os_args(&["use"])), None);
    assert_eq!(parse_target(&os_args(&["use", "--help"])), None);
    assert_eq!(parse_target(&os_args(&["use", "a", "b"])), None);
}

#[test]
fn detects_configured_extension() {
    let doc = json!({
        "teambit.workspace/workspace": {},
        "my-scope/my-aspect": {},
        "other/versioned@1.0.0": {}
    });
    assert!(is_extension_configured(&doc, "my-scope/my-aspect"));
    assert!(is_extension_configured(&doc, "other/versioned"));
    assert!(!is_extension_configured(&doc, "nonexistent"));
}

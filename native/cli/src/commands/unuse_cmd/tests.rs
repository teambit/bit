use super::{find_extension_key, parse_target};
use serde_json::json;
use std::ffi::OsString;

fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_target() {
    assert_eq!(parse_target(&os_args(&["unuse", "my-aspect"])), Some("my-aspect".to_owned()));
    assert_eq!(
        parse_target(&os_args(&["unuse", "scope/my-aspect", "--no-color"])),
        Some("scope/my-aspect".to_owned()),
    );
}

#[test]
fn rejects_invalid_args() {
    assert_eq!(parse_target(&os_args(&["unuse"])), None);
    assert_eq!(parse_target(&os_args(&["unuse", "--help"])), None);
    assert_eq!(parse_target(&os_args(&["unuse", "a", "b"])), None);
}

#[test]
fn finds_extension_key() {
    let doc = json!({
        "teambit.workspace/workspace": {},
        "my-scope/my-aspect": {},
        "other/versioned@1.0.0": {}
    });
    assert_eq!(
        find_extension_key(&doc, "my-scope/my-aspect"),
        Some("my-scope/my-aspect".to_owned()),
    );
    assert_eq!(
        find_extension_key(&doc, "other/versioned"),
        Some("other/versioned@1.0.0".to_owned()),
    );
    assert_eq!(find_extension_key(&doc, "nonexistent"), None);
}

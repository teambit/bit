use super::{Options, is_empty_app_workspace, parse_options};
use std::fs;

#[test]
fn parses_app_options_and_detects_empty_workspace() {
    assert_eq!(parse_options(&[]), Some(Options { json: false }));
    assert_eq!(parse_options(&["list", "-j"]), Some(Options { json: true }));
    assert_eq!(parse_options(&["unknown"]), None);

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_app_workspace(temp.path()).unwrap());
}

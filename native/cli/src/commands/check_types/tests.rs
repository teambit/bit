use super::{Options, is_empty_workspace, parse_options};
use std::fs;

#[test]
fn parses_check_types_options() {
    assert_eq!(
        parse_options(&["ui/*", "-a", "--strict", "--json"]),
        Some(Options {
            pattern: Some("ui/*".into()),
            all: true,
            unmodified: false,
            strict: true,
            json: true,
        }),
    );
}

#[test]
fn detects_empty_workspace_for_check_types() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

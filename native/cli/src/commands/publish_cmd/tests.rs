use super::{Options, is_empty_workspace, parse_options};
use std::fs;

#[test]
fn parses_publish_options_and_detects_empty_workspace() {
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&["comp1", "-d", "--allow-staged", "-j"]),
        Some(Options { pattern: "comp1".into(), dry_run: true, allow_staged: true, json: true }),
    );

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

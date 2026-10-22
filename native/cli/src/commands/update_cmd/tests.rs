use super::{Options, has_no_workspace_dependencies, parse_options};
use std::fs;

#[test]
fn parses_update_options_and_detects_empty_dependencies() {
    assert_eq!(
        parse_options(&["lodash", "-y", "--minor"]),
        Some(Options {
            patterns: vec!["lodash".into()],
            yes: true,
            patch: false,
            minor: true,
            major: false,
            semver: false,
        }),
    );

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(has_no_workspace_dependencies(temp.path()).unwrap());

    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.dependencies/dependency-resolver": {
                "policy": { "dependencies": { "lodash": "4.17.21" } }
            }
        }"#,
    )
    .unwrap();
    assert!(!has_no_workspace_dependencies(temp.path()).unwrap());
}

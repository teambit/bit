use super::{FastOutcome, Options, classify_workspace, parse_options};
use std::fs;

#[test]
fn parses_validate_options() {
    assert_eq!(
        parse_options(&["comp1", "-u", "--fail-fast", "--skip-tasks", "lint,test"]),
        Some(Options {
            pattern: Some("comp1".into()),
            all: false,
            unmodified: true,
            fail_fast: true,
            continue_on_error: false,
            skip_tasks: Some("lint,test".into()),
        }),
    );
}

#[test]
fn classifies_empty_workspace_and_skip_tasks() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();

    assert_eq!(
        classify_workspace(
            temp.path(),
            &Options {
                pattern: None,
                all: false,
                unmodified: false,
                fail_fast: false,
                continue_on_error: false,
                skip_tasks: None,
            },
        )
        .unwrap(),
        Some(FastOutcome::Empty),
    );

    fs::write(
        temp.path().join(".bitmap"),
        r#"{
            "comp1": {
                "scope": "my-scope",
                "version": "0.0.1",
                "mainFile": "index.js",
                "rootDir": "comp1"
            }
        }"#,
    )
    .unwrap();

    assert_eq!(
        classify_workspace(
            temp.path(),
            &Options {
                pattern: None,
                all: false,
                unmodified: true,
                fail_fast: false,
                continue_on_error: false,
                skip_tasks: Some("invalid-task".into()),
            },
        )
        .unwrap(),
        Some(FastOutcome::InvalidSkipTasks { count: 1, invalid: vec!["invalid-task".into()] }),
    );
}

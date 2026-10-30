use super::{
    Chalk, FastOutcome, Options, classify_workspace,
    lint_and_types::{check_ts_content, lint_source_content},
    parse_options,
};
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
            Chalk::new(false),
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
            Chalk::new(false),
        )
        .unwrap(),
        Some(FastOutcome::InvalidSkipTasks { count: 1, invalid: vec!["invalid-task".into()] }),
    );
}

#[test]
fn checks_ts_types_and_js_lint() {
    assert!(check_ts_content("const x: number = 42;\n").is_empty());
    assert!(!check_ts_content("const x: number = \"string\";\n").is_empty());
    let valid_js = "const comp2 = require('../comp2');\nconsole.log(comp2);\n";
    assert!(lint_source_content(valid_js).is_empty());
    assert!(!lint_source_content("console.log(undefinedVariable);\n").is_empty());
}

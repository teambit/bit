use super::{Options, fast_workspace_message, parse_options};
use crate::commands::color::Chalk;
use std::fs;

#[test]
fn parses_script_options() {
    assert_eq!(parse_options(&["-l"]), Some(Options { script_name: None, list: true }));
    assert_eq!(
        parse_options(&["build-svg"]),
        Some(Options { script_name: Some("build-svg".into()), list: false }),
    );
    assert_eq!(parse_options(&[]), Some(Options { script_name: None, list: false }));
}

#[test]
fn detects_unconfigured_envs_and_empty_workspace() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();

    let msg = fast_workspace_message(temp.path(), Chalk::new(false)).unwrap().unwrap();
    assert!(msg.contains("no envs configured"), "{msg}");

    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.workspace/scripts": { "envs": ["my-scope/my-env"] }
        }"#,
    )
    .unwrap();
    let empty_msg = fast_workspace_message(temp.path(), Chalk::new(false)).unwrap().unwrap();
    assert_eq!(empty_msg, "no components found");
}

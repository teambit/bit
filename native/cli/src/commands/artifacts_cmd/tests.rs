use super::{Options, is_empty_workspace, parse_options};
use std::fs;

#[test]
fn parses_artifacts_options() {
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&[
            "comp1",
            "--aspect",
            "teambit.compilation/compiler",
            "--task=compile",
            "--files",
            "dist/**",
            "--out-dir",
            "out",
        ]),
        Some(Options {
            pattern: "comp1".into(),
            aspect: Some("teambit.compilation/compiler".into()),
            task: Some("compile".into()),
            files: Some("dist/**".into()),
            out_dir: Some("out".into()),
        }),
    );
}

#[test]
fn detects_empty_workspace_for_artifacts() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

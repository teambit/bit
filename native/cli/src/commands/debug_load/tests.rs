use super::{Options, check_missing_workspace_component, parse_options};
use std::fs;

#[test]
fn parses_debug_load_options() {
    assert_eq!(
        parse_options(&["comp1", "--json"]),
        Some(Options { id: "comp1".into(), json: true }),
    );
    assert_eq!(
        parse_options(&[
            "comp1",
            "--all-aspects",
            "--skip-deps",
            "-r",
            "-p",
            "teambit.envs/envs",
            "--json=false",
        ]),
        Some(Options { id: "comp1".into(), json: false }),
    );
    assert_eq!(parse_options(&[]), None);
}

#[test]
fn detects_unknown_workspace_component() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(
        temp.path().join(".bitmap"),
        r#"{
            "comp1": {
                "scope": "",
                "version": "",
                "mainFile": "index.js",
                "rootDir": "comp1"
            }
        }"#,
    )
    .unwrap();

    assert_eq!(check_missing_workspace_component(temp.path(), "comp1"), Ok(None));
    let err = check_missing_workspace_component(temp.path(), "no/such-component").unwrap().unwrap();
    assert!(err.contains(r#"unable to find "no/such-component" in the workspace"#), "{err}");
}

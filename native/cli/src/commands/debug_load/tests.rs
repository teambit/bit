//! Unit tests for `bit show --legacy` / debug load [`parse_options`] and [`check_missing_workspace_component`].
//!
//! Verifies [`Options`] flag parsing and missing `.bitmap` component diagnostic rendering.

use super::{Options, check_missing_workspace_component, parse_options};
use std::fs;

/// Verifies `bit show --legacy` / debug load option parsing across flags and combined short options.
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
    assert_eq!(parse_options(&["comp1", "-rj"]), Some(Options { id: "comp1".into(), json: true }));
    assert_eq!(parse_options(&["comp1", "-jr"]), Some(Options { id: "comp1".into(), json: true }));
    assert_eq!(parse_options(&[]), None);
}

/// Verifies [`check_missing_workspace_component`] reports missing components and accepts tracked `.bitmap` entries.
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

#[test]
fn scoped_matching_workspace_component_passes_missing_check() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(
        temp.path().join(".bitmap"),
        r#"{ "comp1": { "scope": "", "version": "", "mainFile": "index.js", "rootDir": "comp1" } }"#,
    )
    .unwrap();
    assert_eq!(check_missing_workspace_component(temp.path(), "my-scope/comp1"), Ok(None));
}

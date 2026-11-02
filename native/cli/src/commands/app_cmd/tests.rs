//! Unit tests for `app` command [`parse_options`] and [`discover_workspace_apps`] discovery.
//!
//! Verifies [`Options`] flag parsing, [`is_empty_app_workspace`] detection, and [`extract_app_name`] extraction.

use super::{
    Options, discover_workspace_apps, extract_app_name, is_empty_app_workspace, parse_options,
};
use std::fs;

/// Verifies `bit app` CLI option parsing and empty app workspace detection.
#[test]
fn parses_app_options_and_detects_empty_workspace() {
    assert_eq!(parse_options(&[]), Some(Options { json: false }));
    assert_eq!(parse_options(&["list", "-j"]), Some(Options { json: true }));
    assert_eq!(parse_options(&["unknown"]), None);
    assert_eq!(parse_options(&["list", "--json", "true", "--no-color", "--json", "false"]), None);

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_app_workspace(temp.path()).unwrap());
}

/// Verifies [`discover_workspace_apps`] and [`extract_app_name`] across tracked workspace components.
#[test]
fn discovers_app_components_in_workspace() {
    assert_eq!(
        extract_app_name("export default { name: 'my-web-app', entry: [] };"),
        Some("my-web-app".into()),
    );
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
                "mainFile": "index.ts",
                "rootDir": "comp1"
            }
        }"#,
    )
    .unwrap();
    fs::create_dir_all(temp.path().join("comp1")).unwrap();
    fs::write(temp.path().join("comp1/index.ts"), "export const x = 1;\n").unwrap();
    assert_eq!(discover_workspace_apps(temp.path()), Some(vec![]));

    fs::write(
        temp.path().join("comp1/comp1.bit-app.ts"),
        "export default { name: 'sample-app' };\n",
    )
    .unwrap();
    assert_eq!(
        discover_workspace_apps(temp.path()),
        Some(vec![("my-scope/comp1".into(), "sample-app".into())]),
    );
}

#[test]
fn extract_app_name_handles_double_quotes_and_returns_none_when_absent() {
    assert_eq!(
        extract_app_name(r#"export default { name: "double-quoted-app" };"#),
        Some("double-quoted-app".into()),
    );
    assert_eq!(extract_app_name("export const value = 1;"), None);
}

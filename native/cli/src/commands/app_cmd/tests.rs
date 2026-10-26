use super::{
    Options, discover_workspace_apps, extract_app_name, is_empty_app_workspace, parse_options,
};
use std::fs;

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

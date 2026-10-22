use super::{Options, is_empty_workspace, parse_options};
use std::fs;

#[test]
fn parses_compile_options() {
    assert_eq!(
        parse_options(&["comp1", "comp2", "-c", "-v", "--json", "-d", "--generate-types"]),
        Some(Options {
            components: vec!["comp1".into(), "comp2".into()],
            changed: true,
            verbose: true,
            json: true,
            delete_dist_dir: true,
            generate_types: true,
        }),
    );
}

#[test]
fn detects_empty_workspace_for_compile() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

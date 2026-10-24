use super::{Options, checker::check_ts_content, is_empty_workspace, parse_options};
use std::fs;

#[test]
fn parses_check_types_options() {
    assert_eq!(
        parse_options(&["ui/*", "-a", "--strict", "--json"]),
        Some(Options {
            pattern: Some("ui/*".into()),
            all: true,
            unmodified: false,
            strict: true,
            json: true,
        }),
    );
}

#[test]
fn detects_empty_workspace_for_check_types() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

#[test]
fn checks_ts_content_for_type_mismatches() {
    let bad = "const x: number = 'not a number';\nexport default x;\n";
    assert_eq!(check_ts_content(bad).len(), 1);
    let good = "const x: number = 42;\nexport default x;\n";
    assert!(check_ts_content(good).is_empty());
    let permissive = "export function greet(name) {\n  return 'hello ' + name;\n}\n";
    assert!(check_ts_content(permissive).is_empty());
}

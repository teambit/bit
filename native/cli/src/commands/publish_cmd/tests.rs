use super::{
    Options, collect_unexported_ids, collect_untagged_ids, is_empty_workspace, parse_options,
};
use bit_install::workspace::Bitmap;
use std::fs;

#[test]
fn parses_publish_options_and_detects_empty_workspace() {
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&["comp1", "-d", "--allow-staged", "-j"]),
        Some(Options { pattern: "comp1".into(), dry_run: true, allow_staged: true, json: true }),
    );

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());

    fs::write(
        temp.path().join(".bitmap"),
        r#"{"comp1":{"scope":"","version":"","mainFile":"index.js","rootDir":"comp1"}}"#,
    )
    .unwrap();
    let bitmap = Bitmap::load(temp.path(), Some("my-scope")).unwrap();
    let entries = bitmap.entries.iter().collect::<Vec<_>>();
    assert_eq!(collect_unexported_ids(temp.path(), &entries), vec!["my-scope/comp1".to_owned()]);
    assert_eq!(collect_untagged_ids(temp.path(), &entries), vec!["my-scope/comp1".to_owned()]);
}

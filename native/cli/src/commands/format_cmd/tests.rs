use super::{Options, is_missing_host, parse_options, validate_lint_pattern};
use crate::commands::color::Chalk;
use std::fs;

#[test]
fn parses_format_options_and_detects_missing_host() {
    let opts = parse_options(&["ui/*", "-c", "--check", "--json"]).unwrap();
    assert_eq!(
        opts,
        Options { pattern: Some("ui/*".into()), changed: true, check: true, json: true },
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_missing_host(temp.path()));
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace":{"defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert_eq!(
        validate_lint_pattern(temp.path(), Some("ui/*"), Chalk::new(false)).as_deref(),
        Some(r#"unable to find any component matching the "ui/*" pattern"#),
    );
}

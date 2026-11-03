//! Unit tests for `check-types` [`parse_options`] and `TypeScript` [`check_ts_content`] checking.
//!
//! Verifies [`Options`] flag parsing and [`is_empty_workspace`] detection on empty workspaces.

use super::{Options, checker::check_ts_content, is_empty_workspace, parse_options};
use std::fs;

/// Verifies [`parse_options`] into [`Options`] for `bit check-types` CLI flags covering pattern, `-a`, `--strict`, and `--json`.
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

/// Verifies [`is_empty_workspace`] detects an empty `.bitmap` for `bit check-types`.
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

/// Verifies [`check_ts_content`] detects `TypeScript` type mismatches while accepting valid or untyped code.
#[test]
fn checks_ts_content_for_type_mismatches() {
    let bad = "const x: number = 'not a number';\nexport default x;\n";
    assert_eq!(check_ts_content(bad).len(), 1);
    let good = "const x: number = 42;\nexport default x;\n";
    assert!(check_ts_content(good).is_empty());
    let permissive = "export function greet(name) {\n  return 'hello ' + name;\n}\n";
    assert!(check_ts_content(permissive).is_empty());
}

/// Verifies that [`parse_options`] returns `None` when given an unrecognized `check-types` flag.
/// Ensures unknown flags decline native `check-types` handling.
#[test]
fn unknown_check_types_option_returns_none() {
    assert_eq!(parse_options(&["--unknown-flag"]), None);
}

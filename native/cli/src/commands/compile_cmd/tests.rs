//! Unit tests for `bit compile` [`parse_options`] and [`validate_compile_selectors`] validation.
//!
//! Verifies [`Options`] flag parsing and selector validation against `.bitmap` and `workspace.jsonc`.

use super::{Options, parse_options, validate_compile_selectors};
use std::fs;
use tempfile::tempdir;

/// Verifies `bit compile` CLI option parsing across component patterns and boolean flags.
/// Checks `-c`, `-v`, `--json`, `-d`, and `--generate-types`.
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

/// Verifies [`validate_compile_selectors`] rejects unscoped missing IDs and invalid scope or component names.
#[test]
fn validates_compile_selectors_for_unscoped_and_invalid_ids() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{"teambit.workspace/workspace":{"defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    fs::write(dir.path().join(".bitmap"), "{}").unwrap();
    let missing_unscoped = Options { components: vec!["unknown".into()], ..Options::default() };
    assert_eq!(
        validate_compile_selectors(dir.path(), &missing_unscoped).as_deref(),
        Some(
            r#"error: component ID "unknown" is invalid, please use the following format: [scope]/<name>"#
        ),
    );
    let invalid_scope = Options { components: vec!["BadScope/comp1".into()], ..Options::default() };
    assert_eq!(
        validate_compile_selectors(dir.path(), &invalid_scope).as_deref(),
        Some(
            r#"error: "BadScope" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#
        ),
    );
    let invalid_name =
        Options { components: vec!["my-scope/bad.name".into()], ..Options::default() };
    assert_eq!(
        validate_compile_selectors(dir.path(), &invalid_name).as_deref(),
        Some(
            r#"error: "bad.name" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]"#
        ),
    );
    let valid_missing = Options { components: vec!["my-scope/comp1".into()], ..Options::default() };
    assert_eq!(validate_compile_selectors(dir.path(), &valid_missing), None);
}

/// Verifies that [`parse_options`] returns `None` when given an unrecognized flag.
/// Ensures unsupported `bit compile` flags decline cleanly.
#[test]
fn unknown_compile_flag_returns_none() {
    assert_eq!(parse_options(&["--unknown-flag"]), None);
}

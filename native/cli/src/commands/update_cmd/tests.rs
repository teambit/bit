//! Unit tests for `bit update` [`Options`] CLI parsing ([`parse_options`]) and empty workspace dependency detection ([`has_no_workspace_dependencies`]).
//!
//! Verifies `--yes`, `--patch`, `--minor`, `--major`, and `--semver` flag parsing.

use super::{Options, has_no_workspace_dependencies, parse_options};
use std::fs;

/// Verifies `bit update` [`Options`] parsing via [`parse_options`] and empty dependency checks via [`has_no_workspace_dependencies`].
#[test]
fn parses_update_options_and_detects_empty_dependencies() {
    assert_eq!(
        parse_options(&["lodash", "-y", "--minor"]),
        Some(Options {
            patterns: vec!["lodash".into()],
            yes: true,
            patch: false,
            minor: true,
            major: false,
            semver: false,
        }),
    );

    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(has_no_workspace_dependencies(temp.path()).unwrap());

    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{
            "teambit.workspace/workspace": { "defaultScope": "my-scope" },
            "teambit.dependencies/dependency-resolver": {
                "policy": { "dependencies": { "lodash": "4.17.21" } }
            }
        }"#,
    )
    .unwrap();
    assert!(!has_no_workspace_dependencies(temp.path()).unwrap());
    assert_eq!(parse_options(&["--unknown"]), None);
}

/// Verifies that [`parse_options`] parses empty `bit update` arguments to [`Options::default`].
#[test]
fn empty_update_args_parse_to_default_options() {
    assert_eq!(parse_options(&[]), Some(Options::default()));
}

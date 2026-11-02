//! Unit tests for `bit eject` [`Options`] CLI parsing ([`parse_options`]) and active-lane rejection ([`validate_workspace`]).
//!
//! Verifies `--force`, `--keep-files`, and `--skip-dependency-installation` flags and lane preflight guards.

use super::{Options, parse_options, validate_workspace};
use std::fs;

/// Verifies `bit eject` CLI option parsing for short flags and explicit boolean assignments.
#[test]
fn parses_eject_options() {
    assert_eq!(
        parse_options(&["comp1", "-f", "-x", "--keep-files"]),
        Some(Options {
            pattern: "comp1".into(),
            force: true,
            skip_dependency_installation: true,
            json: false,
            keep_files: true,
        }),
    );
    assert_eq!(
        parse_options(&[
            "comp1",
            "--force=true",
            "--skip-dependency-installation=false",
            "--json=true",
            "--keep-files=false",
        ]),
        Some(Options {
            pattern: "comp1".into(),
            force: true,
            skip_dependency_installation: false,
            json: true,
            keep_files: false,
        }),
    );
    assert_eq!(parse_options(&[]), None);
}

/// Verifies [`validate_workspace`] rejects `bit eject` when `.bitmap` is checked out on a lane.
#[test]
fn rejects_eject_when_workspace_on_lane() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join(".bitmap"),
        r#"{
            "comp1": {
                "scope": "my-scope",
                "version": "00112233445566778899aabbccddeeff00112233",
                "mainFile": "index.js",
                "rootDir": "comp1"
            },
            "_bit_lane": {
                "id": { "name": "dev", "scope": "my-scope" },
                "exported": false
            }
        }"#,
    )
    .unwrap();
    let err = validate_workspace(temp.path(), "comp1").unwrap().unwrap();
    assert!(err.contains("unable to eject when the workspace is on a lane"), "{err}");
}

/// Verifies [`parse_options`] accepts patterns after `--` and rejects unrecognized short flags.
/// Confirms `-fx -- comp1` sets `force` and `skip_dependency_installation`.
#[test]
fn parses_trailing_double_dash_pattern_and_rejects_unknown_short_flags() {
    let parsed = parse_options(&["-fx", "--", "comp1"]).unwrap();
    assert_eq!(parsed.pattern, "comp1");
    assert!(parsed.force && parsed.skip_dependency_installation);
    assert_eq!(parse_options(&["-z", "comp1"]), None);
}

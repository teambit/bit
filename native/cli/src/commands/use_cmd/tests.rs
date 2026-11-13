//! Unit tests for `bit use` CLI target parsing ([`parse_target`]) and configured aspect detection ([`is_extension_configured`]).
//!
//! Verifies aspect target extraction and matching against existing `workspace.jsonc` extension keys in [`is_extension_configured`].

use super::{is_extension_configured, parse_target};
use serde_json::json;
use std::ffi::OsString;

/// Converts string slice tokens into [`OsString`] vectors for [`parse_target`].
fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

/// Verifies that [`parse_target`] extracts the aspect target argument from [`os_args`] and ignores `--no-color`.
#[test]
fn parses_target() {
    assert_eq!(parse_target(&os_args(&["use", "my-aspect"])), Some("my-aspect".to_owned()));
    assert_eq!(
        parse_target(&os_args(&["use", "scope/my-aspect", "--no-color"])),
        Some("scope/my-aspect".to_owned()),
    );
}

/// Verifies that [`parse_target`] rejects missing, `--help`, or multiple aspect arguments in [`os_args`].
#[test]
fn rejects_invalid_args() {
    assert_eq!(parse_target(&os_args(&["use"])), None);
    assert_eq!(parse_target(&os_args(&["use", "--help"])), None);
    assert_eq!(parse_target(&os_args(&["use", "a", "b"])), None);
}

/// Verifies [`is_extension_configured`] matches exact and versioned aspect keys in `workspace.jsonc`.
///
/// Also confirms that unconfigured aspect names and `null` JSON values return `false`.
#[test]
fn detects_configured_extension() {
    let doc = json!({
        "teambit.workspace/workspace": {},
        "my-scope/my-aspect": {},
        "other/versioned@1.0.0": {}
    });
    assert!(is_extension_configured(&doc, "my-scope/my-aspect"));
    assert!(is_extension_configured(&doc, "other/versioned"));
    assert!(!is_extension_configured(&doc, "nonexistent"));
    assert!(!is_extension_configured(&json!(null), "my-scope/my-aspect"));
}

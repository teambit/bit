//! Unit tests for `bit unuse` CLI target parsing ([`parse_target`]) and configured aspect lookup ([`find_extension_key`]).
//!
//! Verifies aspect ID matching with and without default scope or version suffixes.

use super::{find_extension_key, parse_target};
use serde_json::json;
use std::ffi::OsString;

/// Converts string slice tokens into [`OsString`] vectors for [`parse_target`].
fn os_args(args: &[&str]) -> Vec<OsString> {
    args.iter()
        .map(OsString::from)
        .collect()
}

/// Verifies that [`parse_target`] extracts the aspect ID argument from [`os_args`] and ignores `--no-color`.
#[test]
fn parses_target() {
    assert_eq!(parse_target(&os_args(&["unuse", "my-aspect"])), Some("my-aspect".to_owned()));
    assert_eq!(
        parse_target(&os_args(&["unuse", "scope/my-aspect", "--no-color"])),
        Some("scope/my-aspect".to_owned()),
    );
}

/// Verifies that [`parse_target`] rejects missing, `--help`, or multiple aspect arguments in [`os_args`].
#[test]
fn rejects_invalid_args() {
    assert_eq!(parse_target(&os_args(&["unuse"])), None);
    assert_eq!(parse_target(&os_args(&["unuse", "--help"])), None);
    assert_eq!(parse_target(&os_args(&["unuse", "a", "b"])), None);
}

/// Verifies [`find_extension_key`] matches exact and version-suffixed aspect keys in `workspace.jsonc`.
///
/// Also confirms that non-existent aspect IDs and non-object JSON documents return `None`.
#[test]
fn finds_extension_key() {
    let doc = json!({
        "teambit.workspace/workspace": {},
        "my-scope/my-aspect": {},
        "other/versioned@1.0.0": {}
    });
    assert_eq!(
        find_extension_key(&doc, "my-scope/my-aspect"),
        Some("my-scope/my-aspect".to_owned()),
    );
    assert_eq!(
        find_extension_key(&doc, "other/versioned"),
        Some("other/versioned@1.0.0".to_owned()),
    );
    assert_eq!(find_extension_key(&doc, "nonexistent"), None);
    assert_eq!(find_extension_key(&json!(null), "my-scope/my-aspect"), None);
}

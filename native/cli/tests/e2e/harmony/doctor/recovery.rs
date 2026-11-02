//! Canonical index repair ([`fixture`], [`compare_recovery`]) is selected before native `bit doctor` output or writes.
//!
//! Ensures stale or missing `.bit/index.json` state is reconciled identically to Node.js.

use crate::helper::Helper;
use serde_json::Value;
use std::{ffi::OsStr, fs, path::Path};

/// Creates a workspace with a tagged `bar/foo` component for scope index recovery tests.
fn fixture() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'doctor-index';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "--message diagnosis");
    helper
}

/// Runs `bit doctor "validate scope objects" --json` and asserts canonical loader recovery and `.bit/index.json` parity.
fn compare_recovery(helper: &Helper, oracle: &Path) {
    let command = r#"doctor "validate scope objects" --json"#;
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE_QUIET", OsStr::new("1"))],
    );
    let expected = Helper::cmd_in_with(oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bit/index.json")).ok(),
        fs::read(oracle.join(".bit/index.json")).ok(),
    );
    assert!(!actual.native, "{}", actual.trace);
    assert!(actual.trace.contains("doctor preflight"), "{}", actual.trace);
}
/// Verifies stale `.bit/index.json` entries are repaired by the canonical loader before native effects ([`fixture`], [`compare_recovery`]).
#[test]
fn stale_index_is_repaired_by_the_canonical_loader_before_any_native_effect() {
    let helper = fixture();
    let index: Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
    )
    .unwrap();
    let rows = index
        .as_array()
        .or_else(|| index["components"].as_array())
        .unwrap();
    let hash = rows[0]["hash"].as_str().unwrap();
    fs::remove_file(
        helper.scopes.local_path
            .join(".bit/objects")
            .join(&hash[..2])
            .join(&hash[2..]),
    )
    .unwrap();
    let oracle = helper.clone_workspace();
    compare_recovery(&helper, &oracle);
}
/// Verifies that rebuilding a deleted `.bit/index.json` preserves canonical state ([`fixture`], [`compare_recovery`]).
#[test]
fn rebuilding_a_lost_populated_index_preserves_canonical_state() {
    let helper = fixture();
    fs::remove_file(helper.scopes.local_path.join(".bit/index.json")).unwrap();
    let oracle = helper.clone_workspace();
    if cfg!(windows) {
        super::compare(&helper, &oracle, r#"doctor "validate scope objects" --json"#, &[]);
        assert!(!helper.scopes.local_path.join(".bit/index.json").exists());
        assert!(!oracle.join(".bit/index.json").exists());
    } else {
        compare_recovery(&helper, &oracle);
    }
}

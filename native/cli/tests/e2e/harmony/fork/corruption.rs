//! Broken remote Sources must preserve the released failure and complete publication prefix.
use super::support;
use crate::{
    commands::move_paths::support::{compare, setup},
    helper::Helper,
};
use std::{fs, path::PathBuf};
fn source_object(helper: &Helper) -> PathBuf {
    let version: serde_json::Value =
        serde_json::from_str(&setup(helper, "cat-component comp1@0.0.1 --json")).unwrap();
    let reference = version["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["relativePath"] == "index.js")
        .unwrap()["file"]
        .as_str()
        .unwrap();
    helper.scopes.remote_path
        .join("objects")
        .join(&reference[..2])
        .join(&reference[2..])
}
#[test]
fn missing_remote_source_keeps_the_released_error_and_no_tracked_target() {
    let helper = support::exported(1);
    let source = source_object(&helper);
    assert!(source.is_file(), "exported source must exist");
    fs::remove_file(&source).unwrap();
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    let result = compare(&helper, &format!("fork {}/comp1 comp-copy -x", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(support::ids(&helper).is_empty());
    assert!(!source.exists());
}
#[test]
fn corrupt_remote_source_keeps_its_bytes_and_the_complete_canonical_failure_prefix() {
    let helper = support::exported(1);
    let source = source_object(&helper);
    fs::write(&source, b"invalid compressed remote Source").unwrap();
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    let result = compare(&helper, &format!("fork {}/comp1 comp-copy -x", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(support::ids(&helper).is_empty());
    assert_eq!(fs::read(source).unwrap(), b"invalid compressed remote Source");
}

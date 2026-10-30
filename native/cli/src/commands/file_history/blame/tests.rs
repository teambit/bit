use super::{Target, classify_target, parse_args, published_source_key};
use std::fs;
use tempfile::tempdir;

#[test]
fn published_windows_absolute_path_never_becomes_version_relative_path() {
    let key = published_source_key(r"D:\workspace\comp1", "D:/workspace/comp1/index.js");
    assert_eq!(key, "D:/workspace/comp1/index.js");
    assert_ne!(key, "index.js");
}

#[test]
fn published_posix_absolute_path_becomes_version_relative_path() {
    assert_eq!(published_source_key("/workspace/comp1", "/workspace/comp1/index.js"), "index.js");
}

#[test]
fn published_prefix_removal_preserves_repeated_prefix_in_nested_file() {
    assert_eq!(
        published_source_key("/workspace/comp1", "/workspace/comp1/a/workspace/comp1/index.js",),
        "a/workspace/comp1/index.js",
    );
}

#[test]
fn parses_blame_args_with_no_color_and_classifies_targets() {
    assert_eq!(parse_args(&["comp1/index.ts", "-m", "--no-color"]), Some(("comp1/index.ts", true)));
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join(".bitmap"),
        r#"{"comp1":{"name":"comp1","scope":"","version":"","mainFile":"index.ts","rootDir":"comp1","defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    assert_eq!(classify_target(dir.path(), "comp1/index.ts").unwrap(), Target::Unversioned);
    assert_eq!(classify_target(dir.path(), "other/index.ts").unwrap(), Target::Unowned);
}

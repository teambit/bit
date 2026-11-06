//! Unit tests for `bit blame` path key normalization ([`published_source_key`]), CLI parsing ([`parse_args`]), and [`Target`] classification ([`classify_target`]).
//!
//! Verifies POSIX and Windows component prefix stripping and file target lookup in [`published_source_key`] and [`classify_target`].

use super::{Target, classify_target, parse_args, published_source_key};
use std::fs;
use tempfile::tempdir;

/// Verifies that mixed-separator Windows drive paths are not stripped as POSIX component prefixes by [`published_source_key`].
#[test]
fn published_windows_absolute_path_never_becomes_version_relative_path() {
    let key = published_source_key(r"D:\workspace\comp1", "D:/workspace/comp1/index.js");
    assert_eq!(key, "D:/workspace/comp1/index.js");
    assert_ne!(key, "index.js");
}

/// Verifies [`published_source_key`] strips a matching POSIX component root prefix from a file path.
#[test]
fn published_posix_absolute_path_becomes_version_relative_path() {
    assert_eq!(published_source_key("/workspace/comp1", "/workspace/comp1/index.js"), "index.js");
}

/// Verifies [`published_source_key`] strips only the leading component root prefix when repeated in nested subdirectories.
#[test]
fn published_prefix_removal_preserves_repeated_prefix_in_nested_file() {
    assert_eq!(
        published_source_key("/workspace/comp1", "/workspace/comp1/a/workspace/comp1/index.js",),
        "a/workspace/comp1/index.js",
    );
}

/// Verifies [`parse_args`] with `--no-color` / `--include-message` and [`classify_target`] [`Target`] classification against `.bitmap`.
#[test]
fn parses_blame_args_with_no_color_and_classifies_targets() {
    assert_eq!(
        parse_args(&["comp1/index.ts", "-m", "--no-color", "--no-color=false"]),
        Some(("comp1/index.ts", true)),
    );
    assert_eq!(
        parse_args(&["comp1/index.ts", "--include-message=true"]),
        Some(("comp1/index.ts", true)),
    );
    assert_eq!(
        parse_args(&["comp1/index.ts", "--include-message=false"]),
        Some(("comp1/index.ts", false)),
    );
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join(".bitmap"),
        r#"{"comp1":{"name":"comp1","scope":"","version":"","mainFile":"index.ts","rootDir":"comp1","defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    assert_eq!(classify_target(dir.path(), "comp1/index.ts").unwrap(), Target::Unversioned);
    assert_eq!(classify_target(dir.path(), "other/index.ts").unwrap(), Target::Unowned);
}

/// Verifies that [`parse_args`] rejects empty or multi-positional `bit blame` invocations.
#[test]
fn rejects_empty_or_multi_positional_blame_args() {
    assert_eq!(parse_args(&[]), None);
    assert_eq!(parse_args(&["a.ts", "b.ts"]), None);
}

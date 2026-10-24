use super::{clear_caches, format_report, parse_args};
use crate::commands::color::Chalk;
use std::{ffi::OsString, fs};

fn args(items: &[&str]) -> Vec<OsString> {
    items
        .iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_plain_invocation_and_declines_remote_flag() {
    assert!(parse_args(&args(&["clear-cache"])));
    assert!(parse_args(&args(&["cc", "--no-color"])));
    assert!(!parse_args(&args(&["clear-cache", "--remote", "my-scope"])));
    assert!(!parse_args(&args(&["clear-cache", "-r", "my-scope"])));
}

#[test]
fn clears_workspace_fs_cache_and_scope_index() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("workspace.jsonc"), "{}").unwrap();
    let scope = root.join(".bit");
    let fs_cache = scope.join("cache").join("components");
    fs::create_dir_all(&fs_cache).unwrap();
    fs::write(fs_cache.join("entry"), "cached").unwrap();
    fs::write(scope.join("index.json"), "[]").unwrap();

    let cleared = clear_caches(root, Some(root));
    assert_eq!(cleared, vec!["components cache on the filesystem", "scope-index file"]);
    assert!(!fs_cache.exists());
    assert!(!scope.join("index.json").exists());

    let report = format_report(&cleared, Chalk::new(false));
    assert!(report.contains("caches cleared"));
    assert!(report.contains("components cache on the filesystem"));
    assert!(report.contains("scope-index file"));
}

#[test]
fn clears_bare_scope_index_only() {
    let dir = tempfile::tempdir().unwrap();
    let scope = dir.path();
    fs::write(scope.join("scope.json"), "{}").unwrap();
    fs::write(scope.join("index.json"), "[]").unwrap();

    let cleared = clear_caches(scope, None);
    assert_eq!(cleared, vec!["scope-index file"]);
    assert!(!scope.join("index.json").exists());
}

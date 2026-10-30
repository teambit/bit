use super::{clear_caches, format_remote_report, format_report, parse_args};
use crate::commands::color::Chalk;
use serde_json::json;
use std::{ffi::OsString, fs};

fn args(items: &[&str]) -> Vec<OsString> {
    items
        .iter()
        .map(OsString::from)
        .collect()
}

#[test]
fn parses_plain_and_remote_invocations() {
    assert_eq!(parse_args(&args(&["clear-cache"])), Some(None));
    assert_eq!(parse_args(&args(&["cc", "--no-color"])), Some(None));
    assert_eq!(
        parse_args(&args(&["clear-cache", "--remote", "my-scope"])),
        Some(Some("my-scope".to_owned())),
    );
    assert_eq!(
        parse_args(&args(&["clear-cache", "-r", "my-scope", "--no-color"])),
        Some(Some("my-scope".to_owned())),
    );
    assert_eq!(parse_args(&args(&["cc", "--remote=my-scope"])), Some(Some("my-scope".to_owned())));
    assert_eq!(parse_args(&args(&["clear-cache", "--remote"])), None);
    assert_eq!(parse_args(&args(&["clear-cache", "--remote", "--no-color"])), None);
    assert_eq!(parse_args(&args(&["clear-cache", "positional"])), None);
}

#[test]
fn formats_remote_report_for_truthy_and_falsy_responses() {
    let chalk = Chalk::new(false);
    let ok = format_remote_report("my-scope", &json!(true), chalk);
    assert!(ok.contains(r#"cleaned the cache of "my-scope""#));
    let failed = format_remote_report("my-scope", &json!(false), chalk);
    assert!(failed.contains(r#"failed cleaning the cache of "my-scope""#));
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

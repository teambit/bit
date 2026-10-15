//! The no-fs-cache feature detects dependencies afresh without touching the
//! dependency cache, across read and write commands.

use crate::helper::{FOO_FIXTURE, Helper, Run, parse};
use std::{ffi::OsStr, fs, path::Path};

fn run(root: &Path, line: &str, node: bool) -> Run {
    let mut env = vec![("BIT_FEATURES", OsStr::new("no-fs-cache")), ("CI", OsStr::new("1"))];
    if node {
        env.push(("BIT_NATIVE", OsStr::new("off")));
    }
    Helper::cmd_in_with(root, line, &env)
}

fn cache(root: &Path) -> std::path::PathBuf {
    root.join(".bit/cache/components/deps")
}

fn cache_contents(directory: &Path) -> Vec<(std::path::PathBuf, Vec<u8>)> {
    let mut files = Vec::new();
    if directory.exists() {
        collect_cache_contents(directory, directory, &mut files);
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    files
}

fn collect_cache_contents(
    root: &Path,
    directory: &Path,
    files: &mut Vec<(std::path::PathBuf, Vec<u8>)>,
) {
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_cache_contents(root, &path, files);
        } else {
            files.push((
                path.strip_prefix(root)
                    .unwrap()
                    .to_path_buf(),
                fs::read(path).unwrap(),
            ));
        }
    }
}

fn compare(helper: &Helper, line: &str, json: bool) {
    let node_root = helper.clone_workspace();
    let rust_root = &helper.scopes.local_path;
    let rust = run(rust_root, line, false);
    let node = run(&node_root, line, true);
    assert!(rust.native, "{}", rust.trace);
    assert_eq!(rust.status.code(), node.status.code(), "{line}");
    assert_eq!(rust.stderr, node.stderr, "{line}");
    if json {
        assert_eq!(parse(&rust.stdout), parse(&node.stdout), "{line}");
    } else {
        let stable = |output: &str| {
            output
                .lines()
                .filter(|line| !line.contains("importing components (completed in"))
                .collect::<Vec<_>>()
                .join("\n")
        };
        assert_eq!(stable(&rust.stdout), stable(&node.stdout), "{line}");
    }
    assert!(!cache(rust_root).exists(), "Rust wrote the dependency cache for {line}");
    assert!(!cache(&node_root).exists(), "Node wrote the dependency cache for {line}");
    if line.starts_with("checkout") {
        assert_eq!(
            fs::read(rust_root.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
        );
    }
    if line.starts_with("checkout") {
        assert_eq!(
            fs::read(rust_root.join("bar/foo.js")).unwrap(),
            fs::read(node_root.join("bar/foo.js")).unwrap(),
        );
    }
}

#[test]
fn status_json_and_text_detect_fresh_without_a_cache() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/foo.js", "require('missing-example-package');");
    helper.add_component_bar_foo();
    let _ = fs::remove_dir_all(cache(&helper.scopes.local_path));
    compare(&helper, "status --json", true);
    compare(&helper, "status", false);
}

#[test]
fn status_ignores_and_preserves_an_existing_cache() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("status --json");
    let before = cache_contents(&cache(&helper.scopes.local_path));
    assert!(!before.is_empty());
    let node_root = helper.clone_workspace();
    let rust = run(&helper.scopes.local_path, "status --json", false);
    let node = run(&node_root, "status --json", true);
    assert!(rust.native, "{}", rust.trace);
    assert_eq!(rust.status.code(), node.status.code());
    assert_eq!(rust.stderr, node.stderr);
    assert_eq!(parse(&rust.stdout), parse(&node.stdout));
    assert_eq!(cache_contents(&cache(&helper.scopes.local_path)), before);
}

#[test]
fn diff_detects_fresh_without_a_cache() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    let _ = fs::remove_dir_all(cache(&helper.scopes.local_path));
    compare(&helper, "diff bar/foo --json", true);
}

#[test]
fn checkout_reset_restores_files_without_a_cache() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo("module.exports = 'edited';");
    let _ = fs::remove_dir_all(cache(&helper.scopes.local_path));
    compare(&helper, "checkout reset bar/foo -x", false);
}

//! Tagging creates the generated component package when `bit link` has not run.

use crate::helper::{FOO_FIXTURE, Helper, config};
use std::{ffi::OsStr, fs, path::Path};

fn package(root: &Path) -> Vec<u8> {
    fs::read(root.join("node_modules/@my-scope/bar.foo/package.json")).unwrap()
}

fn compare(helper: &Helper, node_workspace: &Path, command: &str) {
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(node_workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(package(&helper.scopes.local_path), package(node_workspace));
    let source = |root: &Path| root.join("node_modules/@my-scope/bar.foo/foo.js");
    assert_eq!(
        fs::read(source(&helper.scopes.local_path)).unwrap(),
        fs::read(source(node_workspace)).unwrap(),
    );
    #[cfg(unix)]
    assert!(
        fs::symlink_metadata(source(&helper.scopes.local_path))
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&node_workspace.join(".bitmap")),
    );
}

#[test]
fn tag_unlinked_component_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.delete_path("node_modules/@my-scope/bar.foo");
    let node_workspace = helper.clone_workspace();
    compare(&helper, &node_workspace, "tag bar/foo --message first");
}

#[test]
fn persist_unlinked_soft_tag_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.delete_path("node_modules/@my-scope/bar.foo");
    let node_workspace = helper.clone_workspace();
    helper.native_run("tag --soft bar/foo --message first");
    Helper::cmd_in_with(
        &node_workspace,
        "tag --soft bar/foo --message first",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    compare(&helper, &node_workspace, "tag --persist=skip-build");
}

#[test]
fn tag_existing_component_without_generated_package_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    helper.delete_path("node_modules/@my-scope/bar.foo");
    helper.append_file("bar/foo.js", "\n// second version");
    let node_workspace = helper.clone_workspace();
    compare(&helper, &node_workspace, "tag bar/foo --message second");
}

#[test]
fn persist_existing_component_without_generated_package_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    helper.delete_path("node_modules/@my-scope/bar.foo");
    helper.append_file("bar/foo.js", "\n// second version");
    let node_workspace = helper.clone_workspace();
    helper.native_run("tag --soft bar/foo --message second");
    Helper::cmd_in_with(
        &node_workspace,
        "tag --soft bar/foo --message second",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    compare(&helper, &node_workspace, "tag --persist=skip-build");
}

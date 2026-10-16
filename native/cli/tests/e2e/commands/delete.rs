//! Local `bit delete` parity against the pinned Node.js CLI.

use super::remove::scope_objects;
use crate::helper::Helper;
use std::{ffi::OsStr, fs};

fn compare_result(helper: &Helper, baseline: &std::path::Path, command: &str, files: &str) {
    helper.get_cloned_workspace(baseline);
    let root = &helper.scopes.local_path;
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    for path in [".bitmap", ".bit/index.json"] {
        assert_eq!(
            fs::read(root.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
    assert_eq!(scope_objects(root), scope_objects(&node_root));
    assert_eq!(root.join(files).exists(), node_root.join(files).exists());
    let package = format!("node_modules/@{}/bar.foo", helper.scopes.remote);
    assert_eq!(root.join(&package).exists(), node_root.join(&package).exists());
    let bitmap_before = fs::read(baseline.join(".bitmap")).unwrap();
    for workspace in [root, &node_root] {
        let metadata =
            fs::read_to_string(workspace.join(".bit/bitmap-history-metadata.txt")).unwrap();
        let receipt = metadata.lines().last().unwrap();
        let file_id = receipt.strip_suffix(" delete").unwrap();
        assert_eq!(
            fs::read(
                workspace
                    .join(".bit/bitmap-history")
                    .join(format!(".bitmap-{file_id}"))
            )
            .unwrap(),
            bitmap_before,
        );
    }
}

#[test]
fn tagged_component_delete_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    let baseline = helper.clone_workspace();
    compare_result(&helper, &baseline, "delete bar/foo --silent", "bar/foo.js");
}

#[test]
fn imported_component_delete_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    let baseline = helper.clone_workspace();
    let command = format!("delete {}/bar/foo --silent", helper.scopes.remote);
    let files = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    compare_result(&helper, &baseline, &command, &files);
}

#[test]
fn ranged_component_delete_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    let baseline = helper.clone_workspace();
    compare_result(&helper, &baseline, "delete bar/foo --silent --range ^0.0.1", "bar/foo.js");
}

#[test]
fn snap_selection_delete_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.run("snap --message one");
    let bitmap = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    let version = bitmap
        .lines()
        .find(|line| line.trim().starts_with(r#""version":"#))
        .unwrap()
        .split('"')
        .nth(3)
        .unwrap();
    let baseline = helper.clone_workspace();
    compare_result(
        &helper,
        &baseline,
        &format!("delete bar/foo --silent --snaps {version}"),
        "bar/foo.js",
    );
}

#[test]
fn new_component_delete_delegates_untouched() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    let node_root = helper.clone_workspace();
    let command = "delete bar/foo --silent";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd(command);
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), node.status.code());
    assert_eq!(actual.stdout, node.stdout);
    assert_eq!(actual.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

#[test]
fn unexported_lane_delete_delegates_untouched() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';");
    helper.add_component_bar_foo();
    helper.run("snap --message lane");
    let node_root = helper.clone_workspace();
    let command = "delete bar/foo --silent --lane";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd(command);
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), node.status.code());
    assert_eq!(actual.stdout, node.stdout);
    assert_eq!(actual.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

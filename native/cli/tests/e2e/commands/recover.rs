//! Local `bit recover -x` parity against the pinned Node.js CLI.

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
    for path in [".bitmap", ".bit/index.json", files] {
        assert_eq!(
            fs::read(root.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
    assert_eq!(scope_objects(root), scope_objects(&node_root));
    let bitmap_before = fs::read(baseline.join(".bitmap")).unwrap();
    for workspace in [root, &node_root] {
        let metadata =
            fs::read_to_string(workspace.join(".bit/bitmap-history-metadata.txt")).unwrap();
        let receipt = metadata.lines().last().unwrap();
        let file_id = receipt.strip_suffix(" recover").unwrap();
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
fn tagged_component_recovery_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("delete bar/foo --silent");
    let baseline = helper.clone_workspace();
    compare_result(&helper, &baseline, "recover bar/foo", "bar/foo.js");
}

#[test]
fn imported_component_recovery_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    helper.run(&format!("delete {}/bar/foo --silent", helper.scopes.remote));
    let baseline = helper.clone_workspace();
    let command = format!("recover {}/bar/foo", helper.scopes.remote);
    let files = format!("{}/bar/foo/foo.js", helper.scopes.remote);
    compare_result(&helper, &baseline, &command, &files);
}

#[test]
fn ranged_component_recovery_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("delete bar/foo --silent --range ^0.0.1");
    let baseline = helper.clone_workspace();
    compare_result(&helper, &baseline, "recover bar/foo -x", "bar/foo.js");
}

#[test]
fn snap_selection_recovery_matches_node() {
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
    helper.run(&format!("delete bar/foo --silent --snaps {version}"));
    let baseline = helper.clone_workspace();
    compare_result(&helper, &baseline, "recover bar/foo -x", "bar/foo.js");
}

#[test]
fn modified_ranged_component_delegates_to_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("delete bar/foo --silent --range ^0.0.1");
    fs::write(helper.scopes.local_path.join("bar/foo.js"), "module.exports = 'edit';").unwrap();
    let node_root = helper.clone_workspace();
    let command = "recover bar/foo -x";
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
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(node_root.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn unsnapped_component_recovery_delegates_to_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    let node_root = helper.clone_workspace();
    let command = "recover bar/foo -x";
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
fn ci_recovery_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'new';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    helper.run("delete bar/foo --silent");
    let node_root = helper.clone_workspace();
    let command = "recover bar/foo -x";
    let node = Helper::cmd_in_with(
        &node_root,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

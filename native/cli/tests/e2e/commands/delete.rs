//! Local `bit delete` parity against the pinned Node.js CLI.
mod completion;
mod hard;
mod selectors;

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
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/bar/foo -x", helper.scopes.remote));
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
    helper.native("snap --message one");
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
    let actual = helper.native_run(command);
    assert!(actual.native, "{}", actual.trace);
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
    helper.native("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';");
    helper.add_component_bar_foo();
    helper.native("snap --message lane");
    let node_root = helper.clone_workspace();
    let command = "delete bar/foo --silent --lane";
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run(command);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), node.status.code());
    assert_eq!(actual.stdout, node.stdout);
    assert_eq!(actual.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
}

pub(super) fn exported_lane_setup(helper: &Helper, extra_snap: bool) {
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "");
    crate::helper::remote::publish(helper);
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    crate::helper::remote::publish(helper);
    if extra_snap {
        fs::write(helper.scopes.local_path.join("bar/foo.js"), "module.exports = 'second';")
            .unwrap();
        helper.native("snap --message second");
        crate::helper::remote::publish(helper);
    }
}

fn exported_lane_case(helper: &Helper, command: &str, extra_snap: bool) {
    exported_lane_setup(helper, extra_snap);
    compare_exported_lane(helper, command);
}

fn compare_exported_lane(helper: &Helper, command: &str) {
    let baseline = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    helper.get_cloned_workspace(&baseline);
    let root = &helper.scopes.local_path;
    let node_root = helper.clone_workspace();
    helper.restore_remote_scope(&remote);
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    helper.restore_remote_scope(&remote);
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
    assert_eq!(root.join("bar/foo.js").exists(), node_root.join("bar/foo.js").exists());
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
fn exported_lane_component_delete_matches_node() {
    let helper = Helper::new();
    exported_lane_case(&helper, "delete bar/foo --lane --silent", false);
}

#[test]
fn exported_lane_snap_selection_delete_matches_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    let bitmap = fs::read_to_string(helper.scopes.local_path.join(".bitmap")).unwrap();
    let version = bitmap
        .lines()
        .find(|line| line.trim().starts_with(r#""version":"#))
        .unwrap()
        .split('"')
        .nth(3)
        .unwrap();
    let command = format!("delete bar/foo --lane --silent --snaps {version}");
    let baseline = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    let node_root = helper.clone_workspace();
    helper.restore_remote_scope(&remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    helper.get_cloned_workspace(&baseline);
    helper.restore_remote_scope(&remote);
    let native = helper.native_run(&command);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert!(native.status.success());
    let root = &helper.scopes.local_path;
    assert_eq!(
        fs::read(root.join(".bitmap")).unwrap(),
        fs::read(node_root.join(".bitmap")).unwrap(),
    );
    assert_eq!(
        fs::read(root.join(".bit/index.json")).unwrap(),
        fs::read(node_root.join(".bit/index.json")).unwrap(),
    );
    assert_eq!(scope_objects(root), scope_objects(&node_root));
    assert_eq!(
        fs::read(root.join("bar/foo.js")).unwrap(),
        fs::read(node_root.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn exported_lane_multiple_snaps_delete_matches_node() {
    let helper = Helper::new();
    exported_lane_case(&helper, "delete bar/foo --lane --silent", true);
}

#[test]
fn exported_lane_with_dependent_pins_main_version_like_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    helper.output_file(
        "baz/qux.js",
        &format!("module.exports = require('@{}/bar.foo');", helper.scopes.remote),
    );
    helper.native("add baz -i baz/qux");
    compare_dependency_delete(&helper);
}

fn compare_dependency_delete(helper: &Helper) {
    let before = fs::read(helper.scopes.local_path.join("workspace.jsonc")).unwrap();
    let node_root = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    let command = "delete bar/foo --lane --silent";
    helper.restore_remote_scope(&remote);
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    helper.restore_remote_scope(&remote);
    let actual = helper.native_run(command);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), node.status.code());
    assert_eq!(actual.stdout, node.stdout);
    assert_eq!(actual.stderr, node.stderr);
    for path in [".bitmap", ".bit/index.json", "workspace.jsonc", "baz/qux.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(path)).unwrap(),
            fs::read(node_root.join(path)).unwrap(),
            "{path}",
        );
    }
    assert_eq!(scope_objects(&helper.scopes.local_path), scope_objects(&node_root));
    let history = helper.scopes.local_path.join(".bit/workspace-config-history");
    let node_history = node_root.join(".bit/workspace-config-history");
    assert_eq!(history.join("metadata.txt").exists(), node_history.join("metadata.txt").exists());
    if node_history.join("metadata.txt").exists() {
        for directory in [history, node_history] {
            let metadata = fs::read_to_string(directory.join("metadata.txt")).unwrap();
            let last = metadata.lines().last().unwrap();
            let (file_id, reason) = last.split_once(' ').unwrap();
            assert_eq!(reason, "delete (pin deleted-on-lane deps to main)");
            assert_eq!(fs::read(directory.join("files").join(file_id)).unwrap(), before);
        }
    }
}

#[test]
fn exported_lane_independent_component_delete_matches_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    helper.output_file("baz/qux.js", "module.exports = 'independent';");
    helper.native("add baz -i baz/qux");
    compare_dependency_delete(&helper);
}

#[test]
fn exported_lane_only_dependency_delete_without_main_tag_matches_node() {
    let helper = Helper::new();
    exported_lane_only_setup(&helper);
    helper.output_file(
        "baz/qux.js",
        &format!("module.exports = require('@{}/bar.foo');", helper.scopes.remote),
    );
    helper.native("add baz -i baz/qux");
    compare_dependency_delete(&helper);
}

#[test]
fn exported_lane_delete_preserves_existing_peer_policy_like_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    helper.output_file(
        "baz/qux.js",
        &format!("module.exports = require('@{}/bar.foo');", helper.scopes.remote),
    );
    helper.native("add baz -i baz/qux");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut document =
        bit_install::jsonc::Document::parse(&fs::read_to_string(&path).unwrap()).unwrap();
    document.set(
        &["teambit.dependencies/dependency-resolver", "policy", "peerDependencies"],
        &serde_json::json!({format!("@{}/bar.foo", helper.scopes.remote): "~0.0.1"}),
    );
    fs::write(path, format!("{document}\n")).unwrap();
    compare_dependency_delete(&helper);
}

#[test]
fn exported_lane_delete_uses_configured_save_prefix_like_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    helper.output_file(
        "baz/qux.js",
        &format!("module.exports = require('@{}/bar.foo');", helper.scopes.remote),
    );
    helper.native("add baz -i baz/qux");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut document =
        bit_install::jsonc::Document::parse(&fs::read_to_string(&path).unwrap()).unwrap();
    document.set(
        &["teambit.dependencies/dependency-resolver", "savePrefix"],
        &serde_json::json!("~"),
    );
    fs::write(path, format!("{document}\n")).unwrap();
    compare_dependency_delete(&helper);
}

#[test]
fn exported_lane_dependency_delete_ci_color_output_matches_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    helper.output_file(
        "baz/qux.js",
        &format!("module.exports = require('@{}/bar.foo');", helper.scopes.remote),
    );
    helper.native("add baz -i baz/qux");
    let node_root = helper.clone_workspace();
    let command = "delete bar/foo --lane --silent";
    let node = Helper::cmd_in_with(
        &node_root,
        command,
        &[
            ("BIT_NATIVE", OsStr::new("off")),
            ("CI", OsStr::new("1")),
            ("FORCE_COLOR", OsStr::new("1")),
            ("NODE_NO_WARNINGS", OsStr::new("1")),
        ],
    );
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[
            ("CI", OsStr::new("1")),
            ("FORCE_COLOR", OsStr::new("1")),
            ("NODE_NO_WARNINGS", OsStr::new("1")),
        ],
    );
    assert!(native.native, "{}", native.trace);
    assert!(native.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn exported_lane_delete_and_recover_reject_changed_index_before_writes() {
    use bit_object_import::{
        component_delete::{Plan as DeletePlan, Scope},
        component_recover::Plan as RecoverPlan,
    };
    let helper = Helper::new();
    exported_lane_setup(&helper, true);
    let root = &helper.scopes.local_path;
    let index = fs::read(root.join(".bit/index.json")).unwrap();
    let bitmap = fs::read(root.join(".bitmap")).unwrap();
    let source = fs::read(root.join("bar/foo.js")).unwrap();
    let history = fs::read(root.join(".bit/bitmap-history-metadata.txt")).unwrap();
    let delete = DeletePlan::prepare_lane(root, "bar/foo", Scope::Entire).unwrap();
    let mut changed = index.clone();
    changed.push(b'\n');
    fs::write(root.join(".bit/index.json"), &changed).unwrap();
    assert!(delete.commit("2026-10-16-10-00-00").is_err());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(fs::read(root.join("bar/foo.js")).unwrap(), source);
    assert_eq!(fs::read(root.join(".bit/bitmap-history-metadata.txt")).unwrap(), history);
    fs::write(root.join(".bit/index.json"), &index).unwrap();
    helper.native_run("delete bar/foo --lane --silent");
    let bitmap = fs::read(root.join(".bitmap")).unwrap();
    let history = fs::read(root.join(".bit/bitmap-history-metadata.txt")).unwrap();
    let recover = RecoverPlan::prepare(root, "bar/foo").unwrap();
    fs::write(root.join(".bit/index.json"), &changed).unwrap();
    assert!(recover.commit("2026-10-16-10-00-01").is_err());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), bitmap);
    assert!(!root.join("bar/foo.js").exists());
    assert_eq!(fs::read(root.join(".bit/bitmap-history-metadata.txt")).unwrap(), history);
}

pub(super) fn exported_lane_only_setup(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane only';");
    helper.add_component_bar_foo();
    helper.native("snap --message lane");
    crate::helper::remote::publish(helper);
}

#[test]
fn exported_lane_only_component_delete_matches_node() {
    let helper = Helper::new();
    exported_lane_only_setup(&helper);
    compare_exported_lane(&helper, "delete bar/foo --lane --silent");
}

#[test]
fn exported_lane_delete_and_recover_ci_output_matches_node() {
    let helper = Helper::new();
    exported_lane_setup(&helper, false);
    let node_root = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    for command in ["delete bar/foo --lane --silent", "recover bar/foo"] {
        helper.restore_remote_scope(&remote);
        let node = Helper::cmd_in_with(
            &node_root,
            command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        helper.restore_remote_scope(&remote);
        let native =
            Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
        assert!(native.native, "{}", native.trace);
        assert!(native.status.success());
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
        assert_eq!(
            fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
            fs::read(node_root.join(".bitmap")).unwrap(),
        );
        assert_eq!(scope_objects(&helper.scopes.local_path), scope_objects(&node_root));
        assert_eq!(
            fs::read(helper.scopes.local_path.join("bar/foo.js")).ok(),
            fs::read(node_root.join("bar/foo.js")).ok(),
        );
    }
}

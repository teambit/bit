//! `tag --soft` followed by `tag --persist=skip-build` on a real workspace.

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::{ffi::OsStr, path::Path};

fn bitmap(root: &Path) -> serde_json::Value {
    config::read_jsonc(&root.join(".bitmap"))
}

fn compare_command(helper: &Helper, node_workspace: &Path, command: &str) {
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(node_workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!node.native, "{}", node.trace);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native stdout: {}\nnative stderr: {}\nnode stdout: {}\nnode stderr: {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(node_workspace));
}

#[test]
fn soft_tag_then_persist_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --message probe");
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "patch");
    assert_eq!(pending["bar/foo"]["version"], "");
    let native_status = parse(&helper.native("status --json"));
    let node_status =
        Helper::cmd_in_with(&node_workspace, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_status, parse(&node_status.stdout));
    assert_eq!(native_status["softTaggedComponents"][0], "my-scope/bar/foo");

    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    let persisted = bitmap(&helper.scopes.local_path);
    assert!(persisted["bar/foo"].get("nextVersion").is_none());
    assert_eq!(persisted["bar/foo"]["version"], "0.0.1");

    let native_status = parse(&helper.native("status --json"));
    let node_status =
        Helper::cmd_in_with(&node_workspace, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_status, parse(&node_status.stdout));
}

#[test]
fn soft_prerelease_matches_node_and_persist_delegates() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("link");
    let node_workspace = helper.clone_workspace();

    compare_command(
        &helper,
        &node_workspace,
        "tag --soft bar/foo --increment preminor --prerelease-id beta --message preview",
    );
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "preminor");
    assert_eq!(pending["bar/foo"]["nextVersion"]["preRelease"], "beta");

    let native = Helper::cmd_in_with(&helper.scopes.local_path, "tag --persist=skip-build", &[]);
    let node = Helper::cmd_in_with(
        &node_workspace,
        "tag --persist=skip-build",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(bitmap(&helper.scopes.local_path), bitmap(&node_workspace));
}

#[test]
fn repeated_soft_tag_replaces_pending_version_and_message() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --message first");
    compare_command(&helper, &node_workspace, "tag --soft bar/foo --minor --message second");
    let pending = bitmap(&helper.scopes.local_path);
    assert_eq!(pending["bar/foo"]["nextVersion"]["version"], "minor");
    assert_eq!(pending["bar/foo"]["nextVersion"]["message"], "second");
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "0.1.0");
}

#[test]
fn exact_soft_tag_then_persist_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("link");
    let node_workspace = helper.clone_workspace();

    compare_command(&helper, &node_workspace, "tag --soft bar/foo --ver 2.4.0 --message planned");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["nextVersion"]["version"], "2.4.0");
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "2.4.0");
}

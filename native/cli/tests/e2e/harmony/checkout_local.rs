//! Local checkout and revert of versions stored without a remote mapping.

use crate::helper::{FOO_FIXTURE, Helper};
use std::{ffi::OsStr, fs, path::PathBuf};

/// Reset restores the locally tagged version even without a remote mapping.
#[test]
fn checkout_reset_uses_local_history_without_a_remote_mapping() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo("module.exports = 'edited';");

    let node_workspace = checkout_like_node(&helper, "checkout reset bar/foo -x");
    let source = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(source, FOO_FIXTURE);
    assert_eq!(source, fs::read_to_string(node_workspace.join("bar/foo.js")).unwrap());
}

/// A stored tag can be selected from the local repository without resolving a remote.
#[test]
fn checkout_stored_version_uses_local_history_without_a_remote_mapping() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo("module.exports = 'second';");
    helper.tag_component_bar_foo();

    let node_workspace = checkout_like_node(&helper, "checkout 0.0.1 bar/foo -x");
    let source = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(source, FOO_FIXTURE);
    assert_eq!(source, fs::read_to_string(node_workspace.join("bar/foo.js")).unwrap());
}

/// Revert reads the selected stored version while preserving the current tag.
#[test]
fn revert_stored_version_uses_local_history_without_a_remote_mapping() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo("module.exports = 'second';");
    helper.tag_component_bar_foo();

    let node_workspace = checkout_like_node(&helper, "revert bar/foo 0.0.1 -x");
    let source = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(source, FOO_FIXTURE);
    assert_eq!(source, fs::read_to_string(node_workspace.join("bar/foo.js")).unwrap());
}

/// Revert to the main head also uses the local repository when the scope is unmapped.
#[test]
fn revert_main_uses_local_history_without_a_remote_mapping() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo("module.exports = 'edited';");

    let node_workspace = checkout_like_node(&helper, "revert bar/foo main -x");
    let source = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(source, FOO_FIXTURE);
    assert_eq!(source, fs::read_to_string(node_workspace.join("bar/foo.js")).unwrap());
}

/// A configured remote retains checkout's latest-head refresh and its progress lines.
#[test]
fn checkout_reset_keeps_the_mapped_remote_refresh() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.create_component_bar_foo("module.exports = 'edited';");

    let node_workspace = checkout_like_node(&helper, "checkout reset bar/foo -x");
    let source = fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    assert_eq!(source, FOO_FIXTURE);
    assert_eq!(source, fs::read_to_string(node_workspace.join("bar/foo.js")).unwrap());
}

fn checkout_like_node(helper: &Helper, line: &str) -> PathBuf {
    let node_workspace = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_workspace,
        line,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let rust = Helper::cmd_in_with(&helper.scopes.local_path, line, &[("CI", OsStr::new("1"))]);
    assert!(rust.native, "{}", rust.trace);
    assert_eq!(rust.status, node.status);
    let without_import_timing = |output: &str| {
        output
            .lines()
            .filter(|line| !line.contains("importing components (completed in"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    assert_eq!(without_import_timing(&rust.stdout), without_import_timing(&node.stdout));
    assert_eq!(rust.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(),
        fs::read(node_workspace.join(".bitmap")).unwrap(),
    );
    node_workspace
}

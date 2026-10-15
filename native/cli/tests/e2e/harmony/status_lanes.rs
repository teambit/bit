//! Lane-only bitmap visibility in complete `bit status` commands.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use std::ffi::OsStr;

#[test]
fn unavailable_on_main_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("lane create dev");
    helper.run("snap --message first");
    helper.run("export");
    let original = helper.clone_workspace();
    helper.run("switch main");
    helper.run(&format!("lane merge {}/dev --build", helper.scopes.remote));
    helper.run("export");
    helper.get_cloned_workspace(&original);
    helper.run("switch main --skip-fetch");
    helper.run("import");
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status --json");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    assert_eq!(
        parse(&native.stdout)["unavailableOnMain"],
        serde_json::json!([format!("{}/bar/foo", helper.scopes.remote,),]),
    );
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(&node_root, "status", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --quick --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --quick --json");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
}

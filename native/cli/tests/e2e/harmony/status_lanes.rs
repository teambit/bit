//! Lane-only bitmap visibility in complete `bit status` commands.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs};

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
    let node = Helper::cmd_in_with(
        &node_root,
        "status --lanes --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --lanes --json");
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

#[test]
fn pending_updates_from_main_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
    let original = helper.clone_workspace();
    helper.run("switch main");
    helper.append_file("bar/foo.js", "\n// main update");
    helper.run("tag bar/foo --message main");
    helper.run("export");
    helper.get_cloned_workspace(&original);
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --json --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    assert_eq!(parse(&native.stdout)["pendingUpdatesFromMain"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        fs::read(node_root.join(".bit/index.json")).unwrap(),
        fs::read(helper.scopes.local_path.join(".bit/index.json")).unwrap(),
    );
    let remote_ref = format!(".bit/refs/remotes/{}/main", helper.scopes.remote);
    assert_eq!(
        fs::read(node_root.join(&remote_ref)).unwrap(),
        fs::read(helper.scopes.local_path.join(&remote_ref)).unwrap(),
    );
    let component = format!("{}/bar/foo", helper.scopes.remote);
    let hash = format!("{:x}", Sha1::digest(component.as_bytes()));
    let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
    assert_eq!(
        fs::read(node_root.join(&object)).unwrap(),
        fs::read(helper.scopes.local_path.join(&object)).unwrap(),
    );
    let node =
        Helper::cmd_in_with(&node_root, "status --lanes", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let node = Helper::cmd_in_with(
        &node_root,
        "status --lanes --verbose",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --lanes --verbose");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn lane_without_main_updates_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message first");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --json --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    assert_eq!(parse(&native.stdout)["pendingUpdatesFromMain"], serde_json::json!([]));
    let node =
        Helper::cmd_in_with(&node_root, "status --lanes", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn unexported_lane_without_main_head_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("lane create dev");
    helper.run("snap --message lane");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --json --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    let node =
        Helper::cmd_in_with(&node_root, "status --lanes", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

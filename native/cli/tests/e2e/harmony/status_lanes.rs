//! Lane-only bitmap visibility in complete `bit status` commands.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use flate2::read::ZlibDecoder;
use sha1::{Digest, Sha1};
use std::{ffi::OsStr, fs, io::Read, path::Path};

fn inflated(path: &Path) -> Vec<u8> {
    let mut decoder = ZlibDecoder::new(fs::File::open(path).unwrap());
    let mut body = Vec::new();
    decoder.read_to_end(&mut body).unwrap();
    body
}

fn assert_command_parity(helper: &Helper, node_root: &Path, command: &str) -> serde_json::Value {
    let node = Helper::cmd_in_with(node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    if command.contains("--json") {
        let json = parse(&native.stdout);
        assert_eq!(json, parse(&node.stdout));
        json
    } else {
        assert_eq!(native.stdout, node.stdout, "{command}");
        assert_eq!(native.stderr, node.stderr);
        serde_json::Value::Null
    }
}

fn assert_status_variants(helper: &Helper) {
    let node_root = helper.clone_workspace();
    for command in ["status --json", "status --lanes --json", "status", "status --lanes"] {
        assert_command_parity(helper, &node_root, command);
    }
}

#[test]
fn unavailable_on_main_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("lane create dev");
    helper.native("snap --message first");
    helper.native("export");
    let original = helper.clone_workspace();
    helper.native("switch main");
    helper.native(&format!("lane merge {}/dev --build", helper.scopes.remote));
    helper.run("export");
    helper.get_cloned_workspace(&original);
    helper.native("switch main --skip-fetch");
    helper.run("import");
    let node_root = helper.clone_workspace();
    assert_command_parity(&helper, &node_root, "status --json");
    let lanes_json = assert_command_parity(&helper, &node_root, "status --lanes --json");
    assert_eq!(
        lanes_json["unavailableOnMain"],
        serde_json::json!([format!("{}/bar/foo", helper.scopes.remote)]),
    );
    let text_root = helper.clone_workspace();
    assert_command_parity(&helper, &text_root, "status");
    let quick_root = helper.clone_workspace();
    assert_command_parity(&helper, &quick_root, "status --quick --json");
}

#[test]
fn pending_updates_from_main_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message first");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    helper.native("export");
    let original = helper.clone_workspace();
    helper.native("switch main");
    helper.append_file("bar/foo.js", "\n// main update");
    helper.native("tag bar/foo --message main");
    helper.native("export");
    helper.get_cloned_workspace(&original);
    let node_root = helper.clone_workspace();
    let json = assert_command_parity(&helper, &node_root, "status --json --lanes");
    assert_eq!(json["pendingUpdatesFromMain"].as_array().map(Vec::len), Some(1));
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
        inflated(&node_root.join(&object)),
        inflated(&helper.scopes.local_path.join(&object)),
    );
    assert_command_parity(&helper, &node_root, "status --lanes");
    assert_command_parity(&helper, &node_root, "status --lanes --verbose");
}

#[test]
fn lane_without_main_updates_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message first");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    helper.native("export");
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
    helper.native("lane create dev");
    helper.native("snap --message lane");
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

#[test]
fn forked_lane_updates_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create lane-a");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap --message base");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.native("snap --unmodified --message child");
    helper.native("export");
    let clean_root = helper.clone_workspace();
    let clean_json = assert_command_parity(&helper, &clean_root, "status --json --lanes");
    assert_eq!(clean_json["updatesFromForked"], serde_json::json!([]));
    helper.native("switch lane-a");
    helper.append_file("bar/foo.js", "\n// parent update");
    helper.native("snap --message parent");
    helper.native("export");
    helper.native("switch lane-b");
    let node_root = helper.clone_workspace();
    let json = assert_command_parity(&helper, &node_root, "status --json --lanes");
    assert_eq!(json["updatesFromForked"].as_array().map(Vec::len), Some(1));
    let remote_ref = format!(".bit/refs/remotes/{}/lane-a", helper.scopes.remote);
    assert_eq!(
        fs::read(node_root.join(&remote_ref)).unwrap(),
        fs::read(helper.scopes.local_path.join(&remote_ref)).unwrap(),
    );
    let hash = json["updatesFromForked"][0]["divergeData"]["snapsOnTargetOnly"][0]["hash"]
        .as_str()
        .unwrap();
    let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
    assert_eq!(
        inflated(&node_root.join(&object)),
        inflated(&helper.scopes.local_path.join(&object)),
    );
    for command in ["status --json", "status", "status --lanes", "status --lanes --verbose"] {
        assert_command_parity(&helper, &node_root, command);
    }
}

#[test]
fn forked_lane_and_main_updates_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --message base");
    helper.native("export");
    helper.native("lane create lane-a");
    helper.native("snap --unmodified --message parent-base");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.native("snap --unmodified --message child");
    helper.native("export");
    helper.native("switch main");
    helper.append_file("bar/foo.js", "\n// main update");
    helper.native("tag bar/foo --message main");
    helper.native("export");
    helper.native("switch lane-a");
    helper.append_file("bar/foo.js", "\n// parent update");
    helper.native("snap --message parent");
    helper.native("export");
    helper.native("switch lane-b");
    let node_root = helper.clone_workspace();
    let json = assert_command_parity(&helper, &node_root, "status --json --lanes");
    assert_eq!(json["pendingUpdatesFromMain"].as_array().map(Vec::len), Some(1));
    assert_eq!(json["updatesFromForked"].as_array().map(Vec::len), Some(1));
    for lane in ["main", "lane-a"] {
        let remote_ref = format!(".bit/refs/remotes/{}/{lane}", helper.scopes.remote);
        assert_eq!(
            fs::read(node_root.join(&remote_ref)).unwrap(),
            fs::read(helper.scopes.local_path.join(&remote_ref)).unwrap(),
        );
    }
    assert_command_parity(&helper, &node_root, "status --lanes");
}

#[test]
fn soft_removed_component_on_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.output_file("other/index.js", "module.exports = () => 'other';");
    helper.native("add other");
    helper.native("tag bar/foo --message first");
    helper.native("tag other --message first");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified --message lane");
    helper.native("export");
    helper.native("delete bar/foo --silent --lane");
    assert_status_variants(&helper);
    helper.run("snap --unmodified --message removal");
    helper.native("export");
    assert_status_variants(&helper);
    helper.native("remove other --silent");
    assert_status_variants(&helper);
}

#[test]
fn hidden_update_dependent_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp2 --skip-auto-snap --unmodified --message lane");
    helper.native("export");
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    helper.native(&format!("import {}/comp2 -x", helper.scopes.remote));
    helper.output_file(
        &format!("{}/comp2/index.js", helper.scopes.remote),
        "module.exports = () => 'comp2-v2';",
    );
    helper.run("snap --message update");
    let node_root = helper.clone_workspace();
    let node =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(
        !parse(&node.stdout)["pendingUpdateDependents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert_status_variants(&helper);
    helper.run("export");
    assert_status_variants(&helper);
}

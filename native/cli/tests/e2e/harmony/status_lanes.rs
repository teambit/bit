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

fn assert_status_variants(helper: &Helper) {
    let node_root = helper.clone_workspace();
    for command in ["status --json", "status --lanes --json", "status", "status --lanes"] {
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert_eq!(native.status.code(), node.status.code());
        if command.contains("--json") {
            assert_eq!(parse(&native.stdout), parse(&node.stdout));
        } else {
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr);
        }
    }
}

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

#[test]
fn forked_lane_updates_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create lane-a");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("snap --message base");
    helper.run("export");
    helper.run("lane create lane-b");
    helper.run("snap --unmodified --message child");
    helper.run("export");
    let clean_root = helper.clone_workspace();
    let clean_node = Helper::cmd_in_with(
        &clean_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let clean_native = helper.native_run("status --json --lanes");
    assert_eq!(parse(&clean_native.stdout), parse(&clean_node.stdout));
    assert_eq!(parse(&clean_native.stdout)["updatesFromForked"], serde_json::json!([]));
    helper.run("switch lane-a");
    helper.append_file("bar/foo.js", "\n// parent update");
    helper.run("snap --message parent");
    helper.run("export");
    helper.run("switch lane-b");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(parse(&node.stdout)["updatesFromForked"].as_array().map(Vec::len), Some(1));
    let native = helper.native_run("status --json --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    let remote_ref = format!(".bit/refs/remotes/{}/lane-a", helper.scopes.remote);
    assert_eq!(
        fs::read(node_root.join(&remote_ref)).unwrap(),
        fs::read(helper.scopes.local_path.join(&remote_ref)).unwrap(),
    );
    let hash = parse(&native.stdout)["updatesFromForked"][0]["divergeData"]["snapsOnTargetOnly"][0]
        ["hash"]
        .as_str()
        .unwrap()
        .to_owned();
    let object = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
    assert_eq!(
        inflated(&node_root.join(&object)),
        inflated(&helper.scopes.local_path.join(&object)),
    );
    let plain_node =
        Helper::cmd_in_with(&node_root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let plain_native = helper.native_run("status --json");
    assert_eq!(parse(&plain_native.stdout), parse(&plain_node.stdout));
    for command in ["status", "status --lanes", "status --lanes --verbose"] {
        let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
        let native = helper.native_run(command);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
    }
}

#[test]
fn forked_lane_and_main_updates_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    helper.run("export");
    helper.run("lane create lane-a");
    helper.run("snap --unmodified --message parent-base");
    helper.run("export");
    helper.run("lane create lane-b");
    helper.run("snap --unmodified --message child");
    helper.run("export");
    helper.run("switch main");
    helper.append_file("bar/foo.js", "\n// main update");
    helper.run("tag bar/foo --message main");
    helper.run("export");
    helper.run("switch lane-a");
    helper.append_file("bar/foo.js", "\n// parent update");
    helper.run("snap --message parent");
    helper.run("export");
    helper.run("switch lane-b");
    let node_root = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &node_root,
        "status --json --lanes",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.native_run("status --json --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(parse(&native.stdout), parse(&node.stdout));
    assert_eq!(parse(&node.stdout)["pendingUpdatesFromMain"].as_array().map(Vec::len), Some(1));
    assert_eq!(parse(&node.stdout)["updatesFromForked"].as_array().map(Vec::len), Some(1));
    for lane in ["main", "lane-a"] {
        let remote_ref = format!(".bit/refs/remotes/{}/{lane}", helper.scopes.remote);
        assert_eq!(
            fs::read(node_root.join(&remote_ref)).unwrap(),
            fs::read(helper.scopes.local_path.join(&remote_ref)).unwrap(),
        );
    }
    let node =
        Helper::cmd_in_with(&node_root, "status --lanes", &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run("status --lanes");
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}

#[test]
fn soft_removed_component_on_lane_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.output_file("other/index.js", "module.exports = () => 'other';");
    helper.run("add other");
    helper.run("tag bar/foo --message first");
    helper.run("tag other --message first");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    helper.run("export");
    helper.run("delete bar/foo --silent --lane");
    assert_status_variants(&helper);
    helper.run("snap --unmodified --message removal");
    helper.run("export");
    assert_status_variants(&helper);
    helper.run("remove other --silent");
    assert_status_variants(&helper);
}

#[test]
fn hidden_update_dependent_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag");
    helper.run("export");
    helper.run("lane create dev");
    helper.run("snap comp2 --skip-auto-snap --unmodified --message lane");
    helper.run("export");
    helper.seed_hidden_update_dependent(
        &format!("{}/comp1", helper.scopes.remote),
        &format!("{}/dev", helper.scopes.remote),
    );
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
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
